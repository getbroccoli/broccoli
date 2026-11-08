import {
  ADMIN,
  expect,
  giveDefaultTermsStatutoryMinimum,
  giveTermsPolicies,
  OWNER,
  seedEmploymentEnd,
  seedTimeOff,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  signedIn,
  type TermsPolicy,
  test,
  timeOffService,
} from "#test/support";

import { timeOffTypes } from "../db";

test("returns statutory figures followed by the three recorded-only types", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: STATUTORY_AND_RECORD_ONLY,
  });

  const rows = await service.readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toMatchObject([
    {
      timeOffType: { name: "Annual leave", typeKey: "annual_leave" },
      balance: "balance_from_allowance",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      entitlement: 28,
      bankHolidays: 8,
      used: 0,
      remaining: 20,
    },
    ...["Sickness", "Family leave", "Other"].map((name) => ({
      timeOffType: { name },
      balance: "no_balance",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      entitlement: null,
      bankHolidays: null,
      used: 0,
      remaining: null,
    })),
  ]);
});

test("includes bank holidays on top of a 25-day allowance in entitlement", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_25_days_plus_bank_holidays" }],
  });

  const rows = await service.readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toMatchObject([
    {
      timeOffType: { name: "Annual leave" },
      entitlement: 33,
      bankHolidays: 8,
      used: 0,
      remaining: 25,
    },
  ]);
});

test("returns prorated figures for an October joiner", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2026-10-12" });
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);

  const rows = await timeOffService(orm).readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toMatchObject([
    { entitlement: 6.5, bankHolidays: 2, used: 0, remaining: 4.5 },
  ]);
});

test("returns an empty list while no policies are linked", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });

  const rows = await timeOffService(orm).readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toEqual([]);
});

test("uses the first leave year of a future starter", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2027-01-05" });
  await giveDefaultTermsStatutoryMinimum(orm, seed, transact);

  const rows = await timeOffService(orm).readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toMatchObject([
    { timeOffType: { name: "Annual leave" }, periodStart: "2027-01-01", periodEnd: "2027-12-31" },
  ]);
});

test("omits allowance and recorded-only rows for someone who left last year", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, employee.id, "2025-09-30");
  const service = timeOffService(orm);
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: STATUTORY_AND_RECORD_ONLY,
  });

  const rows = await service.readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toEqual([]);
});

test("returns used days and null figures for a person's unlimited policy", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const policy = await seedTimeOffPolicy(orm, {
    name: "Wellbeing days",
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: policy.timeOffTypeId,
    timeOffPolicyId: policy.id,
  });
  const service = timeOffService(orm);
  await transact((tx) =>
    service.ensureAllowances(OWNER, tx, {
      employeeIds: [employee.id],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );

  const rows = await service.readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toEqual([
    {
      timeOffType: {
        id: policy.timeOffTypeId,
        name: "Wellbeing days",
        typeKey: null,
        icon: null,
        colour: null,
        private: false,
      },
      balance: "unlimited_balance",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      entitlement: null,
      bankHolidays: null,
      used: 0,
      remaining: null,
    },
  ]);
});

test("counts approved full and half sickness days but excludes declined days", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ recordOnly: "sickness" }],
  });
  const sickness = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: sickness.id,
    status: "approved",
    days: [
      { date: "2026-03-02", dayPart: "full_day" },
      { date: "2026-03-03", dayPart: "afternoon" },
    ],
  });
  await seedTimeOff(orm, {
    employeeId: employee.id,
    timeOffTypeId: sickness.id,
    status: "declined",
    days: [{ date: "2026-03-04", dayPart: "full_day" }],
  });

  const rows = await service.readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toMatchObject([
    { timeOffType: { name: "Sickness" }, balance: "no_balance", used: 1.5 },
  ]);
});

test("returns every allowance type with Annual leave before company types", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const custom = await seedTimeOffType(orm, "Additional leave");
  const service = timeOffService(orm);
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [
      {
        timeOffTypeId: custom.id,
        version: {
          balance: "balance_from_allowance",
          bankHolidays: "bank_holidays_on_top_of_allowance",
          leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
          rules: [
            {
              kind: "yearly_entitlement",
              entitlementDays: 5,
              entitlementDaysPerWeek: 5,
              maxDays: null,
            },
          ],
        },
      },
      { key: "uk_statutory_minimum" },
    ],
  });

  const rows = await service.readTimeOffTypes(OWNER, { employeeIds: [employee.id] });

  expect(rows.get(employee.id)).toMatchObject([
    {
      timeOffType: { name: "Annual leave" },
      balance: "balance_from_allowance",
      entitlement: 28,
      bankHolidays: 8,
      used: 0,
      remaining: 20,
    },
    {
      timeOffType: { id: custom.id, name: "Additional leave", typeKey: null },
      balance: "balance_from_allowance",
      entitlement: 13,
      bankHolidays: 8,
      used: 0,
      remaining: 5,
    },
  ]);
});

test.for(["self", "manager two levels up", "admin", "peer"] as const)(
  "applies the time off read scope for a %s",
  async (reader, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: "2025-01-01" });
    const manager = await seed.employee();
    const director = await seed.employee();
    const peer = await seed.employee();
    await seed.manager(employee.id, manager.id);
    await seed.manager(manager.id, director.id);
    await giveDefaultTermsStatutoryMinimum(orm, seed, transact);
    const contexts = {
      self: signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] }),
      "manager two levels up": signedIn(orm, { employeeId: director.id, profiles: ["EMPLOYEE"] }),
      admin: ADMIN,
      peer: signedIn(orm, { employeeId: peer.id, profiles: ["EMPLOYEE"] }),
    };

    const rows = await timeOffService(orm).readTimeOffTypes(contexts[reader], {
      employeeIds: [employee.id],
    });

    if (reader === "peer") {
      expect(rows.has(employee.id)).toBe(false);
    } else {
      expect(rows.get(employee.id)).toMatchObject([
        { timeOffType: { name: "Annual leave" }, entitlement: 28, remaining: 20 },
      ]);
    }
  },
);

const STATUTORY_AND_RECORD_ONLY: TermsPolicy[] = [
  { key: "uk_statutory_minimum" },
  { recordOnly: "sickness" },
  { recordOnly: "family_leave" },
  { recordOnly: "other" },
];
