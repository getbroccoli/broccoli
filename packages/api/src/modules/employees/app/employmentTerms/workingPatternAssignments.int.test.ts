import { expect, OWNER, test, workingPatternService, createStandardPattern } from "#test/support";

test("a newer assignment ends the earlier one without resuming it afterwards", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
  });
  const friday = await patterns.createPattern(OWNER, {
    name: "Friday",
    minutes: [0, 0, 0, 0, 450, 0, 0],
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: monday.id,
    startDate: "2026-08-01",
  });

  const history = await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: friday.id,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });

  expect(history.changes).toMatchObject([
    { field: "workingPattern", oldValue: "Monday", newValue: "Friday" },
    { field: "startDate", oldValue: null, newValue: "2026-09-01" },
    { field: "endDate", oldValue: null, newValue: "2026-09-30" },
  ]);
  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-08-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    {
      startDate: "2026-08-01",
      minutes: [450, 0, 0, 0, 0, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-09-01",
      minutes: [0, 0, 0, 0, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-10-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("an assignment cannot overlap a later assignment and a refusal preserves existing weeks", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
  });
  const standard = await createStandardPattern(orm);
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: monday.id,
    startDate: "2026-10-01",
  });
  const period = { employeeIds: [employee.id], from: "2026-08-01", until: "2026-11-30" };
  const before = await patterns.readWorkingWeeks(OWNER, period);

  await expect(
    patterns.assignPattern(OWNER, {
      employeeId: employee.id,
      workingPatternId: standard.id,
      startDate: "2026-09-01",
      endDate: "2026-10-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "endDate", code: "overlaps" }],
  });
  expect(await patterns.readWorkingWeeks(OWNER, period)).toEqual(before);
});
