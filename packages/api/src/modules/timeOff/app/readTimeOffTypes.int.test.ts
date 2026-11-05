import {
  ADMIN,
  expect,
  linkStatutoryMinimumToEnglandAndWales,
  OWNER,
  seedEmploymentEnd,
  seedTimeOff,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  signedIn,
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
  const termsId = await seed.englandAndWalesTermsId();
  const policies = await service.listPolicies(OWNER, orm);
  const statutory = policies.find(({ key }) => key === "uk_statutory_minimum")!;
  const recorded = policies.filter(({ balance }) => balance === "no_balance");
  await transact((tx) =>
    service.linkTermsPolicies(OWNER, tx, {
      termsId,
      timeOffPolicyIds: [statutory.id, ...recorded.map(({ id }) => id)],
    }),
  );

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
  const termsId = await seed.englandAndWalesTermsId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    ({ key }) => key === "uk_25_days_plus_bank_holidays",
  )!;
  await transact((tx) =>
    service.linkTermsPolicies(OWNER, tx, { termsId, timeOffPolicyIds: [policy.id] }),
  );

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
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);

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
  await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);

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
  const termsId = await seed.englandAndWalesTermsId();
  const policies = (await service.listPolicies(OWNER, orm)).filter(
    ({ key, balance }) => key === "uk_statutory_minimum" || balance === "no_balance",
  );
  await transact((tx) =>
    service.linkTermsPolicies(OWNER, tx, {
      termsId,
      timeOffPolicyIds: policies.map(({ id }) => id),
    }),
  );

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
      timeOffType: { id: policy.timeOffTypeId, name: "Wellbeing days", typeKey: null },
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
  const termsId = await seed.englandAndWalesTermsId();
  const policy = (await service.listPolicies(OWNER, orm)).find(
    ({ balance, typeKey }) => balance === "no_balance" && typeKey === "sickness",
  )!;
  await transact((tx) =>
    service.linkTermsPolicies(OWNER, tx, { termsId, timeOffPolicyIds: [policy.id] }),
  );
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
  const custom = await seedTimeOffPolicy(orm, {
    name: "Additional leave",
    balance: "balance_from_allowance",
    entitlementDays: 5,
  });
  const service = timeOffService(orm);
  const termsId = await seed.englandAndWalesTermsId();
  const statutory = (await service.listPolicies(OWNER, orm)).find(
    ({ key }) => key === "uk_statutory_minimum",
  )!;
  await transact((tx) =>
    service.linkTermsPolicies(OWNER, tx, {
      termsId,
      timeOffPolicyIds: [custom.id, statutory.id],
    }),
  );

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
      timeOffType: { id: custom.timeOffTypeId, name: "Additional leave", typeKey: null },
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
    await linkStatutoryMinimumToEnglandAndWales(orm, seed, transact);
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
