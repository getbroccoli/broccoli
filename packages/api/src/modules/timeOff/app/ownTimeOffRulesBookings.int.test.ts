import {
  allowanceService,
  bookTimeOffService,
  calendarDate,
  employeeServices,
  expect,
  giveTermsPolicies,
  OWNER,
  ownTimeOffRulesService,
  readAllowances,
  readTermsPolicies,
  seedTimeOffType,
  test,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";

test("refuses returning to terms without rules for booked time off and keeps the person's state", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const type = await seedTimeOffType(orm, "Study leave");
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: type.id };
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...input,
    startDate: "2026-11-18",
    endDate: "2026-11-18",
  });
  const timeOff = timeOffService(orm, { today: "2026-11-09" });
  const before = await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });
  const allowances = await readAllowances(orm, employee.id);
  const history = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});

  await expect(
    service.useTermsRules(OWNER, { ...input, startDate: "2026-11-11" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "1 person has this time off type booked from that date.",
  });

  expect(await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] })).toEqual(before);
  expect(await readAllowances(orm, employee.id)).toEqual(allowances);
  expect(await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {})).toEqual(history);
});

test("returns to terms without rules after the booked day", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const type = await seedTimeOffType(orm, "Study leave");
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: type.id };
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...input,
    startDate: "2026-11-18",
    endDate: "2026-11-18",
  });

  await service.useTermsRules(OWNER, { ...input, startDate: "2026-11-19" });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(
    result.get(employee.id)?.find(({ timeOffType }) => timeOffType.id === type.id)?.versions,
  ).toMatchObject([{ source: "their_own", startDate: "2026-11-09", endDate: "2026-11-18" }]);
});

test("refuses cancelling a planned own offer needed by a booking and keeps the person's state", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const type = await seedTimeOffType(orm, "Study leave");
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: type.id };
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-12-01", rules: twentyFiveDays });
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...input,
    startDate: "2026-12-02",
    endDate: "2026-12-02",
  });
  const timeOff = timeOffService(orm, { today: "2026-11-09" });
  const before = await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] });
  const allowances = await readAllowances(orm, employee.id);
  const history = await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {});

  await expect(
    service.cancelOwnRulesChange(OWNER, { ...input, startDate: "2026-12-01" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "1 person has this time off type booked from that date.",
  });

  expect(await timeOff.readPersonTimeOff(OWNER, { employeeIds: [employee.id] })).toEqual(before);
  expect(await readAllowances(orm, employee.id)).toEqual(allowances);
  expect(await employeeServices(orm).readEmployeeHistory(OWNER, employee.id, {})).toEqual(history);
});

test("returns to terms whose rules still cover the booked day", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today: "2026-11-09",
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: "2026-11-09" });
  const input = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
  await service.setOwnRules(OWNER, { ...input, startDate: "2026-01-01", rules: twentyFiveDays });
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...input,
    startDate: "2026-11-18",
    endDate: "2026-11-18",
  });

  await service.useTermsRules(OWNER, { ...input, startDate: "2026-11-11" });

  const result = await timeOffService(orm, { today: "2026-11-09" }).readPersonTimeOff(OWNER, {
    employeeIds: [employee.id],
  });
  expect(
    result.get(employee.id)?.find(({ timeOffType }) => timeOffType.id === input.timeOffTypeId)
      ?.versions,
  ).toMatchObject([
    { source: "their_own", startDate: "2026-11-09", endDate: "2026-11-10" },
    {
      source: "from_their_terms",
      startDate: "2026-11-11",
      endDate: null,
      version: { rules: [{ entitlementDays: 20 }] },
    },
  ]);
});

test("keeps personal Annual leave through a shared change and prorates a dated return to terms", async ({
  orm,
  seed,
  transact,
}) => {
  const today = "2026-11-27";
  const person = await seed.employee({ startDate: "2025-01-01" });
  const colleague = await seed.employee({ startDate: "2025-01-01" });
  const employeeIds = [person.id, colleague.id];
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
    today,
  });
  const [annual] = await readTermsPolicies(orm, termsId, today);
  const timeOffTypeId = annual!.timeOffTypeId;
  const input = { employeeId: person.id, timeOffTypeId };
  const ownRules = ownTimeOffRulesService(orm, { today });
  await ownRules.setOwnRules(OWNER, {
    ...input,
    startDate: "2026-01-01",
    rules: { ...twentyFiveDays, entitlementDays: 26 },
  });
  await bookTimeOffService(orm, { today }).bookTimeOff(OWNER, {
    ...input,
    startDate: "2026-12-07",
    endDate: "2026-12-18",
  });
  const timeOff = timeOffService(orm, { today });
  const before = await timeOff.readTimeOffTypes(OWNER, { employeeIds });
  expect(before.get(person.id)).toMatchObject([{ entitlement: 34, used: 10, remaining: 16 }]);
  expect(before.get(colleague.id)).toMatchObject([{ entitlement: 28, used: 0, remaining: 20 }]);

  const policies = timeOffPolicyService(orm, { today });
  const draft = await policies.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId,
    rules: { ...twentyFiveDays, entitlementDays: 22 },
  });
  await policies.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  const published = await timeOff.readTimeOffTypes(OWNER, { employeeIds });
  expect(published.get(person.id)).toEqual(before.get(person.id));
  expect(published.get(colleague.id)).toMatchObject([{ entitlement: 30, used: 0, remaining: 22 }]);

  await ownRules.useTermsRules(OWNER, { ...input, startDate: "2026-07-01" });

  const inherited = await timeOff.readTimeOffTypes(OWNER, { employeeIds });
  expect(inherited.get(person.id)).toMatchObject([
    { entitlement: 32, bankHolidays: 8, used: 10, remaining: 14 },
  ]);
  expect(inherited.get(colleague.id)).toEqual(published.get(colleague.id));
  const datedRules = await timeOff.readPersonTimeOff(OWNER, {
    employeeIds: [person.id],
    from: calendarDate("2026-06-30"),
  });
  expect(datedRules.get(person.id)?.[0]?.versions).toMatchObject([
    { source: "their_own", endDate: "2026-06-30", version: { rules: [{ entitlementDays: 26 }] } },
    {
      source: "from_their_terms",
      startDate: "2026-07-01",
      version: { rules: [{ entitlementDays: 22 }] },
    },
  ]);
  const allowanceId = inherited.get(person.id)![0]!.allowanceId!;
  const history = await allowanceService(orm, { today }).readAllowanceHistory(OWNER, {
    allowanceIds: [allowanceId],
  });
  const change = history.get(allowanceId)?.[0];
  expect(change).toMatchObject({
    cause: "time_off_rules_changed",
    causeDate: "2026-07-01",
    amount: -2,
    balanceAfter: 14,
  });
  expect(change?.parts).toContainEqual({ kind: "entitlement_grant", amount: -2.02 });
  expect(change?.parts).toContainEqual({ kind: "rounding_up_to_half_day", amount: 0.02 });
});

const twentyFiveDays = {
  balance: "balance_from_allowance" as const,
  entitlementDays: 25,
  bankHolidays: "bank_holidays_on_top_of_allowance" as const,
};
