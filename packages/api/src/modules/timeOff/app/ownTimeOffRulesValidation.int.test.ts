import {
  EMPLOYEE,
  expect,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  seedEmploymentEnd,
  test,
  ownTimeOffRulesService,
  timeOffService,
} from "#test/support";

test.for([
  { reason: "this leave year", employmentStart: "2024-03-01", startDate: "2025-12-31" },
  { reason: "the person's start", employmentStart: "2026-05-04", startDate: "2026-03-01" },
])(
  "refuses own rules before $reason",
  async ({ employmentStart, startDate }, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: employmentStart });
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    });
    const [annual] = await readTermsPolicies(orm, termsId);
    const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
    const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };

    await expect(
      service.setOwnRules(OWNER, { ...input, startDate, rules: twentyFiveDays }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "startDate", code: "too_early" }],
    });
  },
);

test("refuses own rules after the person's employment ended", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await seedEmploymentEnd(orm, employee.id, "2026-11-30");

  await expect(
    service.setOwnRules(OWNER, { ...input, startDate: "2026-12-01", rules: twentyFiveDays }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "after_leaving" }],
  });
});

test("refuses an allowance outside the allowed range", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };

  await expect(
    service.setOwnRules(OWNER, {
      ...input,
      startDate: "2027-01-01",
      rules: { ...twentyFiveDays, entitlementDays: 400 },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.entitlementDays", code: "out_of_range" }],
  });
});

test("refuses own rules for an unknown type", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });

  await expect(
    ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
      employeeId: employee.id,
      timeOffTypeId: "00000000-0000-4000-8000-000000000001",
      startDate: "2027-01-01",
      rules: twentyFiveDays,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "timeOffTypeId", code: "not_found" }],
  });
});

test("refuses own rules for an unknown person", async ({ orm, seed, transact }) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);

  await expect(
    ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
      employeeId: "00000000-0000-4000-8000-000000000001",
      timeOffTypeId: annual!.timeOffTypeId,
      startDate: "2027-01-01",
      rules: twentyFiveDays,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("refuses returning to terms without own rules for that type", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };

  await expect(
    service.useTermsRules(OWNER, { ...input, startDate: "2027-01-01" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "none_of_their_own" }],
  });
});

test("refuses changing how a type counts partway through the leave year", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };

  await expect(
    service.setOwnRules(OWNER, {
      ...input,
      startDate: "2026-12-01",
      rules: { balance: "unlimited_balance" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.balance", code: "not_leave_year_start" }],
  });
  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    { source: "from_their_terms", endDate: null, version: { balance: "balance_from_allowance" } },
  ]);
});

test("gives a person Unlimited own rules from their mid-year first day", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2026-05-04" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-09",
  });
  const [annual] = await readTermsPolicies(orm, termsId);

  await ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2026-05-04",
    rules: { balance: "unlimited_balance" },
  });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: null,
      version: { balance: "unlimited_balance" },
    },
  ]);
});

test("refuses returning to terms that count differently partway through the leave year", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2026-01-01",
    rules: { balance: "unlimited_balance" },
  });

  await expect(
    service.useTermsRules(OWNER, { ...input, startDate: "2026-12-01" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "rules.balance", code: "not_leave_year_start" }],
  });
  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    { source: "their_own", endDate: null, version: { balance: "unlimited_balance" } },
  ]);
});

test.for(["setOwnRules", "useTermsRules", "cancelOwnRulesChange"] as const)(
  "refuses a non-admin calling %s",
  async (operation, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: "2024-03-01" });
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    });
    const [annual] = await readTermsPolicies(orm, termsId);
    const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
    const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
    await service.setOwnRules(OWNER, { ...input, startDate: "2027-01-01", rules: twentyFiveDays });

    await expect(
      service[operation](EMPLOYEE, {
        ...input,
        startDate: "2027-01-01",
        rules: twentyFiveDays,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  },
);

const twentyFiveDays = {
  balance: "balance_from_allowance" as const,
  entitlementDays: 25,
  bankHolidays: "bank_holidays_on_top_of_allowance" as const,
};
