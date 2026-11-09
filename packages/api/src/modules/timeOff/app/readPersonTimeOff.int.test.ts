import {
  calendarDate,
  expect,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  seedTimeOffAssignment,
  seedTimeOffPolicy,
  seedTimeOffType,
  signedIn,
  termsService,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";

test("reads every company type in list order, with no versions for types the terms do not offer", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seedTimeOffType(orm, "Wellbeing days");
  await seedTimeOffType(orm, "Additional leave");
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });

  const result = await timeOffService(orm, { today: "2026-06-01" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });

  expect(result.get(employee.id)).toMatchObject([
    {
      timeOffType: { name: "Annual leave" },
      versions: [{ source: "from_their_terms", startDate: "2026-06-01", endDate: null }],
    },
    { timeOffType: { name: "Sickness" }, versions: [] },
    { timeOffType: { name: "Family leave" }, versions: [] },
    { timeOffType: { name: "Other" }, versions: [] },
    { timeOffType: { name: "Additional leave" }, versions: [] },
    { timeOffType: { name: "Wellbeing days" }, versions: [] },
  ]);
});

test("reads today's rules from the terms followed by a planned rule change", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [policy] = await readTermsPolicies(orm, termsId);
  await timeOffPolicyService(orm, { today: "2026-06-01" }).changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2026-09-01",
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 25,
      bankHolidays: "bank_holidays_on_top_of_allowance",
    },
  });

  const result = await timeOffService(orm, { today: "2026-06-01" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });

  expect(result.get(employee.id)?.[0]?.versions).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      version: {
        balance: "balance_from_allowance",
        rules: [{ kind: "yearly_entitlement", entitlementDays: 20 }],
      },
    },
    {
      source: "from_their_terms",
      startDate: "2026-09-01",
      endDate: null,
      version: {
        balance: "balance_from_allowance",
        rules: [{ kind: "yearly_entitlement", entitlementDays: 25 }],
      },
    },
  ]);
});

test("reads a person's own rules for one type ahead of their terms' rules", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ recordOnly: "sickness" }],
  });
  const service = timeOffService(orm, { today: "2026-06-01" });
  const { timeOffTypes } = await service.listTimeOffTypes(OWNER);
  const sickness = timeOffTypes.find(
    ({ timeOffType }) => timeOffType.typeKey === "sickness",
  )!.timeOffType;
  const own = await seedTimeOffPolicy(orm, {
    name: "Own sickness rules",
    timeOffTypeId: sickness.id,
    balance: "unlimited_balance",
  });
  await seedTimeOffAssignment(orm, {
    employeeId: employee.id,
    timeOffTypeId: own.timeOffTypeId,
    timeOffPolicyId: own.id,
  });

  const result = await service.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });

  expect(
    result.get(employee.id)?.find(({ timeOffType }) => timeOffType.id === sickness.id)?.versions,
  ).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-06-01",
      endDate: null,
      version: { balance: "unlimited_balance", rules: [] },
    },
  ]);
});

test("leaves out a colleague whose time off the caller may not read", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const colleague = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  const result = await timeOffService(orm, { today: "2026-06-01" }).readPersonTimeOff(ctx, {
    employeeIds: [employee.id, colleague.id],
  });

  expect([...result.keys()]).toEqual([employee.id]);
});

test("reads Annual leave rules after a previewed move without changing today's rules", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const scotland = await termsService(orm, { today: "2026-11-09" }).createTerms(OWNER, {
    name: "Scotland",
    bankHolidayCalendar: "scotland",
  });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  await giveTermsPolicies(orm, transact, {
    termsId: scotland.id,
    policies: [{ key: "uk_25_days_plus_bank_holidays" }],
  });
  const service = timeOffService(orm, { today: "2026-11-09" });
  const before = await service.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });

  const preview = await service.readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
    move: { termsId: scotland.id, startDate: calendarDate("2026-12-01") },
  });

  const annual = preview
    .get(employee.id)
    ?.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave");
  expect(annual?.versions).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      version: { rules: [{ kind: "yearly_entitlement", entitlementDays: 20 }] },
    },
    {
      source: "from_their_terms",
      startDate: "2026-12-01",
      endDate: null,
      version: { rules: [{ kind: "yearly_entitlement", entitlementDays: 25 }] },
    },
  ]);
  expect(await service.readPersonTimeOff(OWNER, { employeeIds: [employee.id] })).toEqual(before);
});

test("reads a type's rules from a past date when asked", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-09",
  });
  const service = timeOffService(orm, { today: "2026-11-09" });

  const result = await service.readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
    from: calendarDate("2026-03-01"),
  });

  const annual = result
    .get(employee.id)
    ?.find(({ timeOffType }) => timeOffType.typeKey === "annual_leave");
  expect(annual?.versions[0]).toMatchObject({
    startDate: "2026-03-01",
    source: "from_their_terms",
  });
});
