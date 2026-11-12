import {
  bookTimeOffService,
  employeeServices,
  expect,
  giveTermsPolicies,
  OWNER,
  ownTimeOffRulesService,
  readAllowances,
  readTermsPolicies,
  seedTimeOffType,
  test,
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

const twentyFiveDays = {
  balance: "balance_from_allowance" as const,
  entitlementDays: 25,
  bankHolidays: "bank_holidays_on_top_of_allowance" as const,
};
