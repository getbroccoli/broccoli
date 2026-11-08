import {
  ADMIN,
  expect,
  OWNER,
  test,
  workingPatternService,
  createStandardPattern,
} from "#test/support";

test("assigning a pattern returns the employee's history line with the previous terms pattern", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
  });

  const history = await patterns.assignPattern(ADMIN, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    startDate: "2026-09-01",
  });

  expect(history).toMatchObject({
    recordType: "working_pattern",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      { field: "workingPattern", oldValue: "England and Wales", newValue: "Tuesday to Thursday" },
      { field: "startDate", oldValue: null, newValue: "2026-09-01" },
      { field: "endDate", oldValue: null, newValue: null },
    ],
  });
});

test("replacing an assignment records its previous and new end dates", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = await createStandardPattern(orm);
  const input = {
    employeeId: employee.id,
    workingPatternId: standard.id,
    startDate: "2026-09-01",
  };
  await patterns.assignPattern(OWNER, { ...input, endDate: "2026-09-30" });

  const history = await patterns.assignPattern(OWNER, { ...input, endDate: "2026-10-31" });

  expect(history.changes).toContainEqual({
    field: "endDate",
    oldValue: "2026-09-30",
    newValue: "2026-10-31",
  });
});

test("ending an assignment returns to the terms on the next day and records that date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    startDate: "2026-09-01",
  });

  const history = await patterns.endAssignment(OWNER, {
    employeeId: employee.id,
    endDate: "2026-09-30",
  });

  expect(history).toMatchObject({
    recordType: "working_pattern",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      { field: "workingPattern", oldValue: "Tuesday to Thursday", newValue: "England and Wales" },
      { field: "startDate", oldValue: null, newValue: "2026-10-01" },
      { field: "endDate", oldValue: null, newValue: "2026-09-30" },
    ],
  });
  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-09-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    {
      startDate: "2026-09-01",
      minutes: [0, 450, 450, 450, 0, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-10-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("removing an assignment restores the terms over its dates and records the correction", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });

  const history = await patterns.removeAssignment(OWNER, {
    employeeId: employee.id,
    startDate: "2026-09-01",
  });

  expect(history).toMatchObject({
    recordType: "working_pattern",
    recordId: employee.id,
    operation: "UPDATED",
    changes: [
      { field: "workingPattern", oldValue: "Tuesday to Thursday", newValue: "England and Wales" },
      { field: "startDate", oldValue: null, newValue: "2026-09-01" },
      { field: "endDate", oldValue: "2026-09-30", newValue: null },
    ],
  });
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
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("assignment history uses null when the employee had no working pattern", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  await seed.leaveTerms(employee.id);
  const patterns = workingPatternService(orm);
  const standard = await createStandardPattern(orm);

  const history = await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: standard.id,
    startDate: "2026-09-01",
  });

  expect(history.changes).toMatchObject([
    { field: "workingPattern", oldValue: null, newValue: "Standard" },
    { field: "startDate", oldValue: null, newValue: "2026-09-01" },
    { field: "endDate", oldValue: null, newValue: null },
  ]);
});
