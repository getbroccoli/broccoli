import {
  expect,
  OWNER,
  giveTermsPolicies,
  readAllowances,
  readTermsPolicies,
  seedTimeOff,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";
import { ApplicationError } from "../../../core/applicationError";
import { timeOffPolicyRepository } from "../db";

test("stopping from a future date ends today's version the day before and deletes later planned versions", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });
  await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-02-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const result = await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2027-01-01",
  });

  expect(result).toMatchObject({
    id: policy!.id,
    versions: [{ startDate: null, endDate: "2026-12-31", rules: [{ entitlementDays: 20 }] }],
  });
  expect(await timeOffPolicyRepository(orm).findAll()).toEqual([result]);
});

test("stopping from today ends the version yesterday and leaves the type not offered", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const result = await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2026-11-06",
  });

  expect(result.versions).toMatchObject([{ startDate: null, endDate: "2026-11-05" }]);
  const timeOff = await timeOffService(orm, { today: "2026-11-06" }).readTermsTimeOff(OWNER, [
    termsId,
  ]);
  expect(
    timeOff.get(termsId)!.find(({ timeOffType }) => timeOffType.id === result.timeOffType.id)!
      .versions,
  ).toEqual([]);
});

test.for(["approved", "pending_approval"] as const)(
  "%s time off on the stop date prevents stopping the type for a person on the terms",
  async (status, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: "2025-01-01" });
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ recordOnly: "family_leave" }],
      today: "2026-11-06",
    });
    const [policy] = await timeOffPolicyRepository(orm).findAll();
    await seedTimeOff(orm, {
      employeeId: employee.id,
      timeOffTypeId: policy!.timeOffType.id,
      status,
      days: [{ date: "2027-01-01", dayPart: "full_day" }],
    });
    const service = timeOffPolicyService(orm, { today: "2026-11-06" });

    const stopping = service.stopPolicy(OWNER, {
      timeOffPolicyId: policy!.id,
      stopDate: "2027-01-01",
    });

    await expect(stopping).rejects.toBeInstanceOf(ApplicationError);
    await expect(stopping).rejects.toMatchObject({
      code: "CONFLICT",
      message: "1 person has this time off type booked from that date.",
    });
    expect(await timeOffPolicyRepository(orm).findAll()).toEqual([policy]);
  },
);

test("declined time off after the stop date does not prevent stopping the type", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await timeOffPolicyRepository(orm).findAll();
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffType.id,
    status: "declined",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const result = await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2027-01-01",
  });

  expect(result.versions).toMatchObject([{ startDate: null, endDate: "2026-12-31" }]);
});

test.for(["2026-12-31", "2027-01-01"])(
  "stopping on %s is refused when the offer starts on 2027-01-01",
  async (stopDate, { orm, seed }) => {
    const termsId = await seed.defaultTermsId();
    const type = await seedTimeOffType(orm, "Study leave");
    const service = timeOffPolicyService(orm, { today: "2026-11-06" });
    const policy = await service.createPolicy(OWNER, {
      termsId,
      timeOffTypeId: type.id,
      startDate: "2027-01-01",
      rules: { balance: "no_balance" },
    });

    const stopping = service.stopPolicy(OWNER, { timeOffPolicyId: policy.id, stopDate });

    await expect(stopping).rejects.toBeInstanceOf(ApplicationError);
    await expect(stopping).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "stopDate", code: "before_offer" }],
    });
    expect(await timeOffPolicyRepository(orm).findAll()).toEqual([policy]);
  },
);

test("a person with their own rules keeps them and their booked time off does not block the stop", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-06",
  });
  const [policy] = await timeOffPolicyRepository(orm).findAll();
  const personal = await seedTimeOffPolicy(orm, {
    name: "Personal family leave",
    timeOffTypeId: policy!.timeOffType.id,
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffType.id,
    timeOffPolicyId: personal.id,
  });
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy!.timeOffType.id,
    status: "approved",
    days: [{ date: "2027-01-04", dayPart: "full_day" }],
  });
  const before = (await timeOffPolicyRepository(orm).findAll()).find(
    ({ id }) => id === personal.id,
  );
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  const result = await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2027-01-01",
  });

  expect(result.versions).toMatchObject([{ startDate: null, endDate: "2026-12-31" }]);
  expect(await timeOffPolicyRepository(orm).findAll()).toContainEqual(before);
});

test("stopping in December takes December's share of a reached person's yearly entitlement", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-06",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-06" });

  await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2026-12-01",
  });

  const [allowance] = await readAllowances(orm, employee.id);
  // December's 31 of 365 days at 20 days a year go.
  expect(allowance!.lines).toContainEqual({
    kind: "entitlement_grant",
    rule: "yearly_entitlement",
    amount: -1.69863,
    effectiveDate: "2026-12-01",
    causeKind: "time_off_rules_changed",
    causeRef: `${policy!.id}:2026-12-01`,
  });
});

test("offering a stopped type again from before the stop offers it from then on", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ recordOnly: "family_leave" }],
    today: "2026-11-09",
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  const service = timeOffPolicyService(orm, { today: "2026-11-09" });
  await service.stopPolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    stopDate: "2026-11-09",
  });

  const result = await service.changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-01-01",
    rules: { balance: "no_balance" },
  });

  expect(result.versions.at(-1)).toMatchObject({
    startDate: "2026-01-01",
    endDate: null,
    balance: "no_balance",
  });
});
