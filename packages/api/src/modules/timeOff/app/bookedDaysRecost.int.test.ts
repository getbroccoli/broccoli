import {
  expect,
  seedAnnualLeaveEmployee,
  OWNER,
  readAllowances,
  SYSTEM,
  test,
  bookTimeOffService,
  whosOutService,
  timeOffService,
  workingPatternService,
} from "#test/support";

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
  const patterns = workingPatternService(orm, { today: "2026-11-09" });
  const pattern = await patterns.createPattern(OWNER, {
    name: "Monday to Thursday",
    minutes: [450, 450, 450, 450, 0, 0, 0],
  });
  await patterns.assignPattern(OWNER, {
    employeeId: person.employeeId,
    workingPatternId: pattern.id,
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
