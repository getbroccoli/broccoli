import { ADMIN, expect, signedIn, test, workingPatternService } from "#test/support";

test("an employee can read their own working weeks", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const caller = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: employee.id });

  const weeks = await workingPatternService(orm, { today: "2026-11-06" }).readWorkingWeeks(caller, {
    employeeIds: [employee.id],
    from: "2026-09-01",
    until: "2026-09-30",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-09-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("a manager above the direct manager can read the employee's working weeks", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const manager = await seed.employee();
  const director = await seed.employee();
  await seed.manager(employee.id, manager.id);
  await seed.manager(manager.id, director.id);
  const caller = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: director.id });

  const weeks = await workingPatternService(orm, { today: "2026-11-06" }).readWorkingWeeks(caller, {
    employeeIds: [employee.id],
    from: "2026-09-01",
    until: "2026-09-30",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-09-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("an admin can read an unrelated employee's working weeks", async ({ orm, seed }) => {
  const employee = await seed.employee();

  const weeks = await workingPatternService(orm, { today: "2026-11-06" }).readWorkingWeeks(ADMIN, {
    employeeIds: [employee.id],
    from: "2026-09-01",
    until: "2026-09-30",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-09-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("a read refuses the whole selection when it includes another employee", async ({
  orm,
  seed,
}) => {
  const self = await seed.employee();
  const other = await seed.employee();
  const caller = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: self.id });

  await expect(
    workingPatternService(orm, { today: "2026-11-06" }).readWorkingWeeks(caller, {
      employeeIds: [self.id, other.id],
      from: "2026-09-01",
      until: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
