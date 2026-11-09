import { expect, OWNER, test, workingPatternService } from "#test/support";

test("assigning a Scotland pattern changes the calendar from its date despite identical hours", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Standard Scotland",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    startDate: "2026-07-01",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-01-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-07-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "scotland",
    },
  ]);
});

test("changing only a pattern's calendar starts a new working week from its date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find(
    (pattern) => pattern.termsId !== null,
  )!;
  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    startDate: "2026-07-01",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-01-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-07-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "scotland",
    },
  ]);
});
