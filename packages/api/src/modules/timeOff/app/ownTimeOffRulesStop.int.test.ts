import {
  bookTimeOffService,
  calendarDate,
  EMPLOYEE,
  employeeServices,
  expect,
  giveTermsPolicies,
  OWNER,
  ownTimeOffRulesService,
  readAllowances,
  readTermsPolicies,
  seedAnnualLeaveEmployee,
  seedTimeOff,
  seedTimeOffType,
  test,
  timeOffService,
} from "#test/support";
import type { Orm } from "../../../core/db";

test("stops Annual leave from the person's terms on the chosen date", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, { ...person, startDate });

  expect(await versionsFor(orm, person)).toMatchObject([
    {
      source: "from_their_terms",
      startDate: today,
      endDate: "2026-12-31",
      version: { balance: "balance_from_allowance" },
    },
    { source: "their_own", startDate, endDate: null, version: null },
  ]);
});

test("keeps offering Annual leave to a colleague on the same terms", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const colleague = await seed.employee({ startDate: "2025-01-01" });

  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, { ...person, startDate });

  expect(await versionsFor(orm, { ...person, employeeId: colleague.id })).toMatchObject([
    {
      source: "from_their_terms",
      startDate: today,
      endDate: null,
      version: { balance: "balance_from_allowance" },
    },
  ]);
});

test("refuses a booking on the first day the type stops", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, { ...person, startDate });

  await expect(
    bookTimeOffService(orm).bookTimeOff(OWNER, { ...person, startDate, endDate: startDate }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "dates", code: "type_not_offered" }],
  });
});

test("stops a type offered only by the person's own rules", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const type = await seedTimeOffType(orm, "Study leave");
  const person = { employeeId: employee.id, timeOffTypeId: type.id };
  const service = ownTimeOffRulesService(orm, { today });
  await service.setOwnRules(OWNER, {
    ...person,
    startDate: today,
    rules: { balance: "no_balance" },
  });

  await service.stopOffering(OWNER, { ...person, startDate });

  expect(await versionsFor(orm, person)).toMatchObject([
    {
      source: "their_own",
      startDate: today,
      endDate: "2026-12-31",
      version: { balance: "no_balance" },
    },
    { source: "their_own", startDate, endDate: null, version: null },
  ]);
});

test("refuses to stop a type the person is not offered on that date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const type = await seedTimeOffType(orm, "Study leave");

  await expect(
    ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, {
      employeeId: employee.id,
      timeOffTypeId: type.id,
      startDate,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "timeOffTypeId", code: "not_offered" }],
  });
});

test("refuses a stop that would leave booked days without rules and names the lost dates", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  await seedTimeOff(orm, {
    ...person,
    status: "approved",
    days: ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"].map((date) => ({
      date,
      dayPart: "full_day",
    })),
  });
  await seedTimeOff(orm, {
    ...person,
    status: "requested",
    days: [{ date: "2027-01-11", dayPart: "full_day" }],
  });

  await expect(
    ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, { ...person, startDate }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Annual leave is booked on 4–8 Jan, 11 Jan.",
  });
});

test("cancelling a planned stop lets the terms' rules run on", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = ownTimeOffRulesService(orm, { today });
  await service.stopOffering(OWNER, { ...person, startDate });

  await service.cancelOwnRulesChange(OWNER, { ...person, startDate });

  expect(await versionsFor(orm, person)).toMatchObject([
    {
      source: "from_their_terms",
      startDate: today,
      endDate: null,
      version: { balance: "balance_from_allowance" },
    },
  ]);
});

test("cancelling an earlier stop keeps a later planned stop", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = ownTimeOffRulesService(orm, { today });
  await service.stopOffering(OWNER, { ...person, startDate: "2027-02-01" });
  await service.stopOffering(OWNER, { ...person, startDate });

  await service.cancelOwnRulesChange(OWNER, { ...person, startDate });

  expect(await versionsFor(orm, person)).toMatchObject([
    {
      source: "from_their_terms",
      startDate: today,
      endDate: "2027-01-31",
      version: { balance: "balance_from_allowance" },
    },
    { source: "their_own", startDate: "2027-02-01", endDate: null, version: null },
  ]);
});

test("refuses to cancel a stop that has started", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const input = { ...person, startDate };
  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, input);

  await expect(
    ownTimeOffRulesService(orm, { today: startDate }).cancelOwnRulesChange(OWNER, input),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("returning to the terms after a stop offers the type again from the return date", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = ownTimeOffRulesService(orm, { today });
  await service.stopOffering(OWNER, { ...person, startDate });

  await service.useTermsRules(OWNER, { ...person, startDate: "2027-02-01" });

  expect(await versionsFor(orm, person, startDate)).toMatchObject([
    { source: "their_own", startDate, endDate: "2027-01-31", version: null },
    {
      source: "from_their_terms",
      startDate: "2027-02-01",
      endDate: null,
      version: { balance: "balance_from_allowance" },
    },
  ]);
});

test("own rules offer a stopped type again when the terms do not offer it", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const type = await seedTimeOffType(orm, "Study leave");
  const person = { employeeId: employee.id, timeOffTypeId: type.id };
  const service = ownTimeOffRulesService(orm, { today });
  await service.setOwnRules(OWNER, {
    ...person,
    startDate: today,
    rules: { balance: "no_balance" },
  });
  await service.stopOffering(OWNER, { ...person, startDate });

  await service.setOwnRules(OWNER, {
    ...person,
    startDate: "2027-02-01",
    rules: { balance: "no_balance" },
  });

  expect(await versionsFor(orm, person, startDate)).toMatchObject([
    { source: "their_own", startDate, endDate: "2027-01-31", version: null },
    {
      source: "their_own",
      startDate: "2027-02-01",
      endDate: null,
      version: { balance: "no_balance" },
    },
  ]);
});

test("allows a stop partway through a leave year", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, {
    ...person,
    startDate: "2027-07-01",
  });

  expect(await versionsFor(orm, person, "2027-07-01")).toMatchObject([
    { source: "their_own", startDate: "2027-07-01", endDate: null, version: null },
  ]);
});

test("a December stop takes December's share of the person's yearly allowance", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today,
  });
  const [annual] = await readTermsPolicies(orm, termsId);

  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2026-12-01",
  });

  const [allowance] = await readAllowances(orm, employee.id);
  expect(allowance!.lines).toContainEqual(
    expect.objectContaining({ rule: "yearly_entitlement", amount: -1.69863 }),
  );
});

test("records the change from the terms' rules to not offered in the person's history", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  await ownTimeOffRulesService(orm, { today }).stopOffering(OWNER, { ...person, startDate });

  const page = await employeeServices(orm).readEmployeeHistory(OWNER, person.employeeId, {});
  expect(page.edges).toMatchObject([
    { node: { changes: [{ field: `timeOff.${person.timeOffTypeId}` }] } },
  ]);
  const change = page.edges[0]!.node.changes[0]!;
  expect(JSON.parse(change.oldValue!)).toEqual({ startDate, rules: null });
  expect(JSON.parse(change.newValue!)).toEqual({ startDate, notOffered: true });
});

test("refuses an employee who tries to stop offering a type", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  await expect(
    ownTimeOffRulesService(orm, { today }).stopOffering(EMPLOYEE, { ...person, startDate }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

const today = "2026-11-09";
const startDate = "2027-01-01";

async function versionsFor(
  orm: Orm,
  person: { employeeId: string; timeOffTypeId: string },
  from = today,
) {
  const result = await timeOffService(orm, { today }).readPersonTimeOff(OWNER, {
    employeeIds: [person.employeeId],
    from: calendarDate(from),
  });
  return result
    .get(person.employeeId)
    ?.find(({ timeOffType }) => timeOffType.id === person.timeOffTypeId)?.versions;
}
