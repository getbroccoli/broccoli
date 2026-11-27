import {
  allowanceService,
  bookTimeOffService,
  expect,
  OWNER,
  seedAnnualLeaveAllowance,
  SYSTEM,
  test,
  timeOffPolicyService,
  timeOffService,
  whosOutService,
} from "#test/support";

test("keeps booked days and a manual adjustment after the balance goes negative", async ({
  orm,
  seed,
  transact,
}) => {
  const today = "2026-11-27";
  const { allowanceId, employeeId, timeOffTypeId } = await seedAnnualLeaveAllowance(
    orm,
    seed,
    transact,
  );
  const employeeIds = [employeeId];
  const from = "2026-12-07";
  const until = "2026-12-18";
  const booking = await bookTimeOffService(orm, { today }).bookTimeOff(OWNER, {
    employeeId,
    timeOffTypeId,
    startDate: from,
    endDate: until,
  });
  expect(booking.cost).toBe(10);
  const termsId = await seed.defaultTermsId();
  const policies = timeOffPolicyService(orm, { today });
  const draft = await policies.saveTimeOffPolicy(OWNER, {
    termsId,
    timeOffTypeId,
    rules: {
      balance: "balance_from_allowance",
      entitlementDays: 16,
      bankHolidays: "bank_holidays_included_in_allowance",
    },
  });
  await policies.publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });
  const timeOff = timeOffService(orm, { today });
  expect((await timeOff.readTimeOffTypes(OWNER, { employeeIds })).get(employeeId)).toMatchObject([
    { entitlement: 16, bankHolidays: 8, used: 10, remaining: -2 },
  ]);
  const calendar = await whosOutService(orm, { today }).readWhosOut(OWNER, {
    employeeIds,
    from,
    until,
  });
  expect(calendar.get(employeeId)?.timeOff).toMatchObject([
    { id: booking.id, cost: 10, deductedDays: 10 },
  ]);

  const allowances = allowanceService(orm, { today });
  const comment = "Correcting the transferred balance";
  const adjusted = await allowances.adjustAllowance(OWNER, { allowanceId, amount: 3.5, comment });

  expect(adjusted).toMatchObject({ entitlement: 19.5, bankHolidays: 8, used: 10, remaining: 1.5 });
  const history = await allowances.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  expect(history.get(allowanceId)).toMatchObject([
    {
      cause: "allowance_adjusted",
      amount: 3.5,
      balanceAfter: 1.5,
      comment,
      author: { kind: "SIGNED_IN_USER", id: "test-owner" },
      entitlementAfter: 19.5,
      bankHolidaysAfter: 8,
      usedAfter: 10,
    },
    { cause: "time_off_rules_changed", causeDate: "2026-01-01", amount: -12, balanceAfter: -2 },
    {
      cause: "time_off_booked",
      amount: -10,
      balanceAfter: 10,
      bookedDays: { first: from, last: until },
    },
    { cause: "time_off_turned_on", amount: 20, balanceAfter: 20 },
  ]);

  await transact((tx) =>
    timeOff.ensureAllowances(SYSTEM, tx, {
      employeeIds,
      cause: { kind: "DAILY_CHECK", ref: today },
    }),
  );
  expect((await timeOff.readTimeOffTypes(OWNER, { employeeIds })).get(employeeId)).toEqual([
    adjusted,
  ]);
  expect(await allowances.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] })).toEqual(
    history,
  );
  const recalculated = await whosOutService(orm, { today }).readWhosOut(OWNER, {
    employeeIds,
    from,
    until,
  });
  expect(recalculated.get(employeeId)?.timeOff).toEqual(calendar.get(employeeId)?.timeOff);
});
