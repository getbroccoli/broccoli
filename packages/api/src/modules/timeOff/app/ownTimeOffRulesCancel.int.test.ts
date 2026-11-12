import {
  expect,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  seedTermsPolicy,
  test,
  ownTimeOffRulesService,
  timeOffService,
} from "#test/support";

test("cancels the first planned own rules and restores the terms' rules", async ({
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
  await service.setOwnRules(OWNER, { ...input, startDate: "2027-01-01", rules: twentyFiveDays });

  await service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2027-01-01" });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: null,
      version: { rules: [{ entitlementDays: 20 }] },
    },
  ]);
});

test("cancels a planned own-rules change and runs the previous rules to the next change", async ({
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
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2026-12-01",
    rules: { ...twentyFiveDays, entitlementDays: 28 },
  });
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2027-01-01",
    rules: { ...twentyFiveDays, entitlementDays: 30 },
  });

  await service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2026-12-01" });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: "2026-12-31",
      version: { rules: [{ entitlementDays: 25 }] },
    },
    {
      source: "their_own",
      startDate: "2027-01-01",
      endDate: null,
      version: { rules: [{ entitlementDays: 30 }] },
    },
  ]);
});

test("cancels a planned return and runs the own rules to the next own rules", async ({
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
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });
  await service.useTermsRules(OWNER, { ...input, startDate: "2026-12-01" });
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2027-01-01",
    rules: { ...twentyFiveDays, entitlementDays: 30 },
  });

  await service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2026-12-01" });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: "2026-12-31",
      version: { rules: [{ entitlementDays: 25 }] },
    },
    {
      source: "their_own",
      startDate: "2027-01-01",
      endDate: null,
      version: { rules: [{ entitlementDays: 30 }] },
    },
  ]);
});

test("cancels identical own rules saved twice and restores the terms' rules", async ({
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
    startDate: "2027-01-01",
    rules: { balance: "unlimited_balance" },
  });
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2027-07-01",
    rules: { balance: "unlimited_balance" },
  });

  await service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2027-01-01" });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: null,
      version: { balance: "balance_from_allowance", rules: [{ entitlementDays: 20 }] },
    },
  ]);
});

test("refuses a cancellation that exposes a mid-year counts change and keeps the rules", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  const timeOff = timeOffService(orm, { today: "2026-11-09" });
  const { timeOffTypes } = await timeOff.listTimeOffTypes(OWNER);
  const annual = timeOffTypes.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave")!;
  await seedTermsPolicy(orm, {
    termsId,
    timeOffTypeId: annual.timeOffType.id,
    startDate: "2026-01-01",
    version: {
      balance: "unlimited_balance",
      bankHolidays: null,
      leaveYear: { kind: "leave_year_from_fixed_date", month: 1, day: 1 },
      rules: [],
    },
  });
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual.timeOffType.id };
  await service.setOwnRules(OWNER, { ...input, startDate: "2027-01-01", rules: twentyFiveDays });
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2027-07-01",
    rules: { ...twentyFiveDays, entitlementDays: 30 },
  });
  const before = await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });

  await expect(
    service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2027-01-01" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message:
      "Cancelling this change would change how the type counts partway through a leave year.",
  });

  expect(await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] })).toEqual(before);
});

test.for([
  { reason: "started in the past", ownStart: "2026-01-01", startDate: "2026-01-01" },
  { reason: "starts today", ownStart: "2026-11-09", startDate: "2026-11-09" },
  { reason: "does not exist", ownStart: "2026-01-01", startDate: "2027-01-01" },
])(
  "refuses to cancel an own-rules change that $reason",
  async ({ ownStart, startDate }, { orm, seed, transact }) => {
    const employee = await seed.employee({ startDate: "2024-03-01" });
    const termsId = await seed.defaultTermsId();
    await giveTermsPolicies(orm, transact, {
      termsId,
      policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    });
    const [annual] = await readTermsPolicies(orm, termsId);
    const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
    const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
    await service.setOwnRules(OWNER, { ...input, startDate: ownStart, rules: twentyFiveDays });

    await expect(
      service.cancelOwnRulesChange(OWNER, { ...input, startDate }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This change has already started.",
    });
  },
);

const twentyFiveDays = {
  balance: "balance_from_allowance" as const,
  entitlementDays: 25,
  bankHolidays: "bank_holidays_on_top_of_allowance" as const,
};
