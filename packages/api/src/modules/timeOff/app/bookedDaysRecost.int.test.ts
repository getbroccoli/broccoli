import {
  allowanceService,
  expect,
  seedAnnualLeaveEmployee,
  seedAnnualLeaveAllowance,
  OWNER,
  readAllowances,
  SYSTEM,
  test,
  bookTimeOffService,
  whosOutService,
  timeOffService,
  seedOwnWeek,
  seedWorkingPattern,
  transactWithTimeOffEvents,
  workingPatternService,
} from "#test/support";

test.for([
  {
    startDate: "2026-11-27",
    cost: 8,
    entitlement: 27.5,
    remaining: 11.5,
    firstThursday: "not_a_working_day",
    firstThursdayCost: 0,
    firstRefund: "2026-12-10",
  },
  {
    startDate: "2026-12-14",
    cost: 9,
    entitlement: 28,
    remaining: 11,
    firstThursday: "working_day",
    firstThursdayCost: 1,
    firstRefund: "2026-12-17",
  },
])(
  "recosts ten booked days to $cost when Thursdays stop from $startDate",
  async (
    { startDate, cost, entitlement, remaining, firstThursday, firstThursdayCost, firstRefund },
    { orm, seed, transact },
  ) => {
    const { allowanceId, ...person } = await seedAnnualLeaveAllowance(orm, seed, transact);
    const employeeIds = [person.employeeId];
    const timeOff = timeOffService(orm, { today });
    const booking = await bookTimeOffService(orm, { today }).bookTimeOff(OWNER, {
      ...person,
      ...decemberLeave,
    });
    expect(booking.cost).toBe(10);
    expect(
      (await timeOff.readTimeOffTypes(OWNER, { employeeIds })).get(person.employeeId),
    ).toMatchObject([{ entitlement: 28, bankHolidays: 8, used: 10, remaining: 10 }]);

    await workingPatternService(orm, {
      today,
      transact: transactWithTimeOffEvents(orm, { today }),
    }).setOwnWorkingWeek(OWNER, { employeeId: person.employeeId, startDate, ...thursdaysOff });

    expect(
      (await timeOff.readTimeOffTypes(OWNER, { employeeIds })).get(person.employeeId),
    ).toMatchObject([{ entitlement, bankHolidays: 8, used: cost, remaining }]);
    const history = await allowanceService(orm, { today }).readAllowanceHistory(OWNER, {
      allowanceIds: [allowanceId],
    });
    const change = history.get(allowanceId)?.[0];
    expect(change).toMatchObject({
      cause: "working_pattern_changed",
      causeDate: startDate,
      amount: remaining - 10,
      bookedDays: { first: firstRefund, last: "2026-12-17" },
    });
    expect(change?.parts).toContainEqual({ kind: "time_off_booked", amount: 10 - cost });
    const calendar = await whosOutService(orm, { today }).readWhosOut(OWNER, {
      employeeIds,
      from: decemberLeave.startDate,
      until: decemberLeave.endDate,
    });
    const row = calendar.get(person.employeeId);
    expect(row?.timeOff).toMatchObject([
      { id: booking.id, status: "approved", cost, deductedDays: cost },
    ]);
    expect(
      row?.timeOff[0]?.dayCosts?.filter(
        ({ date }) => date === "2026-12-10" || date === "2026-12-17",
      ),
    ).toMatchObject([
      { date: "2026-12-10", cost: firstThursdayCost, reason: firstThursday },
      { date: "2026-12-17", cost: 0, reason: "not_a_working_day" },
    ]);
    expect(
      row?.days.filter(({ date }) => date === "2026-12-10" || date === "2026-12-17"),
    ).toMatchObject([
      { date: "2026-12-10", kind: firstThursday },
      { date: "2026-12-17", kind: "not_a_working_day" },
    ]);
  },
);

test("cancels at the recalculated cost and refunds those eight days only once", async ({
  orm,
  seed,
  transact,
}) => {
  const { allowanceId, ...person } = await seedAnnualLeaveAllowance(orm, seed, transact);
  const employeeIds = [person.employeeId];
  const bookings = bookTimeOffService(orm, { today });
  const booking = await bookings.bookTimeOff(OWNER, { ...person, ...decemberLeave });
  await workingPatternService(orm, {
    today,
    transact: transactWithTimeOffEvents(orm, { today }),
  }).setOwnWorkingWeek(OWNER, {
    employeeId: person.employeeId,
    startDate: today,
    ...thursdaysOff,
  });
  const timeOff = timeOffService(orm, { today });
  expect(
    (await timeOff.readTimeOffTypes(OWNER, { employeeIds })).get(person.employeeId),
  ).toMatchObject([{ used: 8, remaining: 11.5 }]);

  await bookings.cancelTimeOff(OWNER, { timeOffId: booking.id });

  const balances = await timeOff.readTimeOffTypes(OWNER, { employeeIds });
  expect(balances.get(person.employeeId)).toMatchObject([{ used: 0, remaining: 19.5 }]);
  const allowances = allowanceService(orm, { today });
  const history = await allowances.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] });
  expect(history.get(allowanceId)?.[0]).toMatchObject({
    cause: "time_off_cancelled",
    amount: 8,
    balanceAfter: 19.5,
    parts: [{ kind: "time_off_booked", amount: 8 }],
  });

  await expect(bookings.cancelTimeOff(OWNER, { timeOffId: booking.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This time off is already cancelled.",
  });
  await transact((tx) =>
    timeOff.ensureAllowances(SYSTEM, tx, {
      employeeIds,
      cause: { kind: "DAILY_CHECK", ref: today },
    }),
  );
  expect(await timeOff.readTimeOffTypes(OWNER, { employeeIds })).toEqual(balances);
  expect(await allowances.readAllowanceHistory(OWNER, { allowanceIds: [allowanceId] })).toEqual(
    history,
  );
});

test("refunds a booked Friday when the person's working week becomes Monday to Thursday", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  const bookings = bookTimeOffService(orm);
  const booked = await bookings.bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-04",
    endDate: "2026-12-04",
  });
  const service = timeOffService(orm, { today: "2026-11-09" });
  const before = await service.readTimeOffTypes(OWNER, { employeeIds: [person.employeeId] });
  expect(before.get(person.employeeId)).toMatchObject([{ used: 1, remaining: 19 }]);
  const week = await seedWorkingPattern(orm, { minutes: [450, 450, 450, 450, 0, 0, 0] });
  await seedOwnWeek(orm, {
    employeeId: person.employeeId,
    versionId: week.versionId,
    startDate: "2026-12-01",
  });
  const [beforeRecost] = await readAllowances(orm, person.employeeId);

  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [person.employeeId],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );

  const after = await service.readTimeOffTypes(OWNER, { employeeIds: [person.employeeId] });
  // Entitlement still rounds up to 28; the new week also refunds Christmas Day.
  expect(after.get(person.employeeId)).toMatchObject([
    { entitlement: 28, bankHolidays: 7, used: 0, remaining: 21 },
  ]);
  const [afterRecost] = await readAllowances(orm, person.employeeId);
  expect(
    afterRecost!.lines
      .slice(beforeRecost!.lines.length)
      .filter(({ kind }) => kind === "time_off_booked"),
  ).toMatchObject([{ amount: 1, effectiveDate: "2026-12-04" }]);
  const calendar = await whosOutService(orm).readWhosOut(OWNER, {
    employeeIds: [person.employeeId],
    from: "2026-12-04",
    until: "2026-12-04",
  });
  expect(calendar.get(person.employeeId)?.timeOff).toMatchObject([
    { id: booked.id, cost: 0, days: [{ date: "2026-12-04", dayPart: "full_day" }] },
  ]);
});

test("appends no ledger lines on a second engine run after booking", async ({
  orm,
  seed,
  transact,
}) => {
  const person = await seedAnnualLeaveEmployee(orm, seed, transact);
  await bookTimeOffService(orm).bookTimeOff(OWNER, {
    ...person,
    startDate: "2026-12-07",
    endDate: "2026-12-09",
  });
  const service = timeOffService(orm, { today: "2026-11-09" });
  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [person.employeeId],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );
  const before = await readAllowances(orm, person.employeeId);

  await transact((tx) =>
    service.ensureAllowances(SYSTEM, tx, {
      employeeIds: [person.employeeId],
      cause: { kind: "DAILY_CHECK", ref: null },
    }),
  );

  expect(await readAllowances(orm, person.employeeId)).toEqual(before);
});

const today = "2026-11-27";
const decemberLeave = { startDate: "2026-12-07", endDate: "2026-12-18" };
const thursdaysOff = {
  minutes: [450, 450, 450, 0, 450, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
