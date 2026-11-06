import {
  ADMIN,
  EMPLOYEE,
  expect,
  OWNER,
  signedIn,
  test,
  workingPatternService,
  createStandardPattern,
} from "#test/support";

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
      fullDayMinutes: 450,
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
      fullDayMinutes: 450,
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
      fullDayMinutes: 450,
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

test("an employee cannot read or manage workspace patterns", async ({ orm }) => {
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const standard = await createStandardPattern(orm);

  await expect(patterns.listPatterns(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.createPattern(EMPLOYEE, {
      name: "Short days",
      minutes: [240, 240, 240, 240, 240, 0, 0],
      fullDayMinutes: 240,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.renamePattern(EMPLOYEE, {
      workingPatternId: standard.id,
      name: "Renamed",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.changePattern(EMPLOYEE, {
      workingPatternId: standard.id,
      startDate: "2026-09-01",
      minutes: [480, 480, 480, 480, 480, 0, 0],
      fullDayMinutes: 480,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.cancelPatternChange(EMPLOYEE, {
      workingPatternId: standard.id,
      startDate: "2026-12-01",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.deletePattern(EMPLOYEE, { workingPatternId: standard.id }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("a manager without admin permission cannot change a report's assignment", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const manager = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const caller = signedIn(orm, { profiles: ["EMPLOYEE"], employeeId: manager.id });
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const standard = await createStandardPattern(orm);
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: standard.id,
    startDate: "2026-09-01",
  });

  await expect(
    patterns.assignPattern(caller, {
      employeeId: employee.id,
      workingPatternId: standard.id,
      startDate: "2026-10-01",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.endAssignment(caller, {
      employeeId: employee.id,
      endDate: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    patterns.removeAssignment(caller, {
      employeeId: employee.id,
      startDate: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
