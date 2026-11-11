import { expect, OWNER, test, workingPatternService } from "#test/support";

test("a new employee works Standard throughout the requested period", async ({ orm, seed }) => {
  const employee = await seed.employee();

  const weeks = await workingPatternService(orm).readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });

  expect(weeks).toEqual(
    new Map([
      [
        employee.id,
        [
          {
            startDate: "2026-08-01",
            minutes: [450, 450, 450, 450, 450, 0, 0],
            bankHolidayCalendar: "england_and_wales",
          },
        ],
      ],
    ]),
  );
});

test("refuses reading an unknown employee's working weeks", async ({ orm }) => {
  await expect(
    workingPatternService(orm).readWorkingWeeks(OWNER, {
      employeeIds: ["00000000-0000-4000-8000-000000000001"],
      from: "2026-06-01",
      until: "2026-06-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
