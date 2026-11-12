import {
  expect,
  giveTermsPolicies,
  OWNER,
  readAllowances,
  readTermsPolicies,
  termsService,
  test,
  ownTimeOffRulesService,
  timeOffService,
  workingPatternService,
} from "#test/support";

test("gives a person their own Annual leave from a date", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const colleague = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);

  await ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2027-01-01",
    rules: twentyFiveDays,
  });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id, colleague.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: "2026-12-31",
      version: { rules: [{ entitlementDays: 20 }] },
    },
    {
      source: "their_own",
      startDate: "2027-01-01",
      endDate: null,
      version: {
        balance: "balance_from_allowance",
        bankHolidays: "bank_holidays_on_top_of_allowance",
        rules: [{ entitlementDays: 25 }],
      },
    },
  ]);
  expect(result.get(colleague.id)?.[0]?.versions).toMatchObject([
    { source: "from_their_terms", endDate: null, version: { rules: [{ entitlementDays: 20 }] } },
  ]);
});

test("changes the days mid-year and keeps a later own-rules change", async ({
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
    startDate: "2027-01-01",
    rules: { ...twentyFiveDays, entitlementDays: 30 },
  });

  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2026-12-01",
    rules: { ...twentyFiveDays, entitlementDays: 28 },
  });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      version: { rules: [{ entitlementDays: 25 }] },
    },
    {
      source: "their_own",
      startDate: "2026-12-01",
      endDate: "2026-12-31",
      version: { rules: [{ entitlementDays: 28 }] },
    },
    {
      source: "their_own",
      startDate: "2027-01-01",
      endDate: null,
      version: { rules: [{ entitlementDays: 30 }] },
    },
  ]);
});

test("offers Family leave when the person's terms do not offer it", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const timeOff = timeOffService(orm, { today: "2026-11-09" });
  const { timeOffTypes } = await timeOff.listTimeOffTypes(OWNER);
  const family = timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "family_leave",
  )!.timeOffType;

  await ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: family.id,
    startDate: "2026-01-01",
    rules: { balance: "no_balance" },
  });

  const result = await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });
  expect(
    result.get(employee.id)?.find(({ timeOffType }) => timeOffType.id === family.id)?.versions,
  ).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: null,
      version: { balance: "no_balance", rules: [] },
    },
  ]);
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    { source: "from_their_terms", endDate: null, version: { rules: [{ entitlementDays: 20 }] } },
  ]);
});

test("puts a person back on their terms' rules and drops later own rules", async ({
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
    startDate: "2027-02-01",
    rules: { ...twentyFiveDays, entitlementDays: 30 },
  });

  await service.useTermsRules(OWNER, { ...input, startDate: "2027-01-01" });

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
      source: "from_their_terms",
      startDate: "2027-01-01",
      endDate: null,
      version: { rules: [{ entitlementDays: 20 }] },
    },
  ]);
});

test("stops offering a person's own type when returning to terms that do not offer it", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const timeOff = timeOffService(orm, { today: "2026-11-09" });
  const { timeOffTypes } = await timeOff.listTimeOffTypes(OWNER);
  const family = timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "family_leave",
  )!.timeOffType;
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: family.id };
  await service.setOwnRules(OWNER, {
    ...input,
    startDate: "2026-01-01",
    rules: { balance: "no_balance" },
  });

  await service.useTermsRules(OWNER, { ...input, startDate: "2027-01-01" });

  const result = await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });
  expect(
    result.get(employee.id)?.find(({ timeOffType }) => timeOffType.id === family.id)?.versions,
  ).toMatchObject([{ source: "their_own", startDate: "2026-11-09", endDate: "2026-12-31" }]);
  const after = await timeOffService(orm, { today: "2027-01-01" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(
    after.get(employee.id)?.find(({ timeOffType }) => timeOffType.id === family.id)?.versions,
  ).toEqual([]);
});

test("keeps a person's own rules through a move to other terms", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await termsService(orm, { today: "2026-11-09" }).createTerms(OWNER, {
    name: "Scotland",
    bankHolidayCalendar: "scotland",
  });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  await giveTermsPolicies(orm, transact, {
    termsId: scotland.id,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  await ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2026-01-01",
    rules: twentyFiveDays,
  });

  await workingPatternService(orm, { today: "2026-11-09" }).changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland.id,
    startDate: "2026-12-01",
  });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: null,
      version: { rules: [{ entitlementDays: 25 }] },
    },
  ]);
});

test("works out this year's allowance again when own rules are saved", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-09",
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  expect(await readAllowances(orm, employee.id)).toMatchObject([
    { leaveYearStart: "2026-01-01", total: 20 },
  ]);

  await ownTimeOffRulesService(orm, { today: "2026-11-09" }).setOwnRules(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: annual!.timeOffTypeId,
    startDate: "2026-01-01",
    rules: twentyFiveDays,
  });

  const [allowance] = await readAllowances(orm, employee.id);
  expect(allowance).toMatchObject({
    leaveYearStart: "2026-01-01",
    leaveYearEnd: "2026-12-31",
    total: 25,
  });
  expect(allowance!.lines).toContainEqual(
    expect.objectContaining({ causeKind: "time_off_rules_changed" }),
  );
});

const twentyFiveDays = {
  balance: "balance_from_allowance" as const,
  entitlementDays: 25,
  bankHolidays: "bank_holidays_on_top_of_allowance" as const,
};
