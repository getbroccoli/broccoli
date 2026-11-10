import {
  expect,
  seedAnnualLeaveEmployee,
  giveTermsPolicies,
  OWNER,
  readAllowances,
  readTermsPolicies,
  test,
  bookTimeOffService,
  whosOutService,
  timeOffPolicyService,
  timeOffService,
} from "#test/support";

import { timeOffTypes } from "../db";

test("previews no balance for a year whose policy stops counting", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2027-01-04",
    endDate: "2027-01-04",
  });
  const [policy] = await readTermsPolicies(orm, await seed.defaultTermsId());
  await timeOffPolicyService(orm, { today: "2026-11-09" }).changePolicy(OWNER, {
    timeOffPolicyId: policy!.id,
    startDate: "2027-01-01",
    rules: { balance: "no_balance" },
  });

  const preview = await service.previewBooking(OWNER, {
    ...person,
    startDate: "2027-01-05",
    endDate: "2027-01-05",
  });

  expect(preview).toMatchObject({ cost: 1, balances: [], refusal: null });
});

test("previews two full days and a morning without booking or changing the balance", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const before = await readAllowances(orm, person.employeeId);

  const preview = await service.previewBooking(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    halfDays: [{ date: "2026-12-09", dayPart: "morning" }],
  });

  expect(preview).toEqual({
    cost: 2.5,
    refusal: null,
    days: [
      {
        date: "2026-12-07",
        dayPart: "full_day",
        cost: 1,
        reason: "working_day",
        bankHolidayName: null,
      },
      {
        date: "2026-12-08",
        dayPart: "full_day",
        cost: 1,
        reason: "working_day",
        bankHolidayName: null,
      },
      {
        date: "2026-12-09",
        dayPart: "morning",
        cost: 0.5,
        reason: "working_day",
        bankHolidayName: null,
      },
    ],
    balances: [
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        balance: "balance_from_allowance",
        remainingBefore: 20,
        remainingAfter: 17.5,
        usedBefore: 0,
        usedAfter: 2.5,
      },
    ],
  });
  expect(await readAllowances(orm, person.employeeId)).toEqual(before);
  const rows = await timeOffService(orm, { today: "2026-11-09" }).readTimeOffTypes(OWNER, {
    employeeIds: [person.employeeId],
  });
  expect(rows.get(person.employeeId)).toMatchObject([{ used: 0, remaining: 20 }]);
  const calendar = await whosOutService(orm).readWhosOut(OWNER, {
    employeeIds: [person.employeeId],
    from: "2026-12-07",
    until: "2026-12-09",
  });
  expect(calendar.get(person.employeeId)?.timeOff).toEqual([]);
});

test("lists bank holidays and weekends with zero cost and their reasons", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);

  const preview = await bookTimeOffService(orm).previewBooking(OWNER, {
    ...person,
    startDate: "2026-12-24",
    endDate: "2026-12-27",
  });

  expect(preview.days).toEqual([
    {
      date: "2026-12-24",
      dayPart: "full_day",
      cost: 1,
      reason: "working_day",
      bankHolidayName: null,
    },
    {
      date: "2026-12-25",
      dayPart: "full_day",
      cost: 0,
      reason: "bank_holiday",
      bankHolidayName: "Christmas Day",
    },
    {
      date: "2026-12-26",
      dayPart: "full_day",
      cost: 0,
      reason: "not_a_working_day",
      bankHolidayName: null,
    },
    {
      date: "2026-12-27",
      dayPart: "full_day",
      cost: 0,
      reason: "not_a_working_day",
      bankHolidayName: null,
    },
  ]);
  expect(preview.cost).toBe(1);
});

test("previews separate leave years without creating next year's allowance", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const before = await readAllowances(orm, person.employeeId);
  expect(before.map(({ leaveYearStart }) => leaveYearStart)).toEqual(["2026-01-01"]);

  const preview = await bookTimeOffService(orm).previewBooking(OWNER, {
    ...person,
    startDate: "2026-12-24",
    endDate: "2027-01-04",
  });

  expect(preview.balances).toEqual([
    {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      balance: "balance_from_allowance",
      remainingBefore: 20,
      remainingAfter: 16,
      usedBefore: 0,
      usedAfter: 4,
    },
    {
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
      balance: "balance_from_allowance",
      remainingBefore: 20,
      remainingAfter: 19,
      usedBefore: 0,
      usedAfter: 1,
    },
  ]);
  expect(await readAllowances(orm, person.employeeId)).toEqual(before);
});

test("returns the first clashing date and booking in a preview refusal", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const booked = await service.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-08",
    endDate: "2026-12-09",
  });

  const preview = await service.previewBooking(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
  });

  expect(preview.refusal).toEqual({
    reason: "clashes_with_time_off",
    date: "2026-12-08",
    clashingTimeOffId: booked.id,
  });
});

test("previews sickness without balances", async ({ orm, seed, transact }) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await giveTermsPolicies(orm, transact, {
    termsId: await seed.defaultTermsId(),
    policies: [{ recordOnly: "sickness" }],
  });
  const sickness = (await orm.select().from(timeOffTypes)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;

  const preview = await bookTimeOffService(orm).previewBooking(OWNER, {
    employeeId: employee.id,
    timeOffTypeId: sickness.id,
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });

  expect(preview).toMatchObject({ cost: 1, balances: [], refusal: null });
});

test("books the cost shown by the preview", async ({ orm, seed, transact }) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const service = bookTimeOffService(orm);
  const input = {
    ...person,
    startDate: "2026-12-24",
    endDate: "2027-01-04",
    halfDays: [{ date: "2027-01-04", dayPart: "afternoon" as const }],
  };
  const preview = await service.previewBooking(OWNER, input);

  const booked = await service.bookTimeOff(OWNER, input);

  expect(preview.refusal).toBeNull();
  expect(preview.cost).toBe(4.5);
  expect(booked.cost).toBe(preview.cost);
});
