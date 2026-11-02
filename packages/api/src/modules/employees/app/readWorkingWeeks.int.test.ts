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
            effectiveFrom: "2026-08-01",
            minutes: [450, 450, 450, 450, 450, 0, 0],
            fullDayMinutes: 450,
          },
        ],
      ],
    ]),
  );
});

test("an employee outside every group has no working pattern", async ({ orm, seed }) => {
  const employee = await seed.employee();
  await seed.leaveGroups(employee.id);

  const weeks = await workingPatternService(orm).readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      effectiveFrom: "2026-08-01",
      minutes: null,
      fullDayMinutes: null,
    },
  ]);
});

test("an own assignment overrides the group only between its inclusive dates", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    { effectiveFrom: "2026-08-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: [0, 450, 450, 450, 0, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
  ]);
});

test("a Standard change applies to its employees from its date and preserves earlier reads", async ({
  orm,
  seed,
}) => {
  const first = await seed.employee();
  const second = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  const earlier = { employeeIds: [first.id, second.id], from: "2026-08-01", until: "2026-08-31" };
  const before = await patterns.readWorkingWeeks(OWNER, earlier);

  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  expect(await patterns.readWorkingWeeks(OWNER, earlier)).toEqual(before);
  const weeks = await patterns.readWorkingWeeks(OWNER, { ...earlier, until: "2026-10-31" });
  const expected = [
    { effectiveFrom: "2026-08-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: [480, 480, 480, 480, 480, 0, 0], fullDayMinutes: 480 },
  ];
  expect(weeks).toEqual(
    new Map([
      [first.id, expected],
      [second.id, expected],
    ]),
  );
});

test("identical weeks merge across assignment and pattern changes", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Same hours",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });
  await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-15",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      effectiveFrom: "2026-08-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
    },
  ]);
});

test("a full day change splits working weeks even when weekday minutes stay the same", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 480,
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-09-01",
  });

  expect(weeks.get(employee.id)).toEqual([
    { effectiveFrom: "2026-08-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 480 },
  ]);
});

test("a read starts with the week already in effect and excludes later changes", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Short days",
    minutes: [240, 240, 240, 240, 240, 0, 0],
    fullDayMinutes: 240,
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-09-10",
    until: "2026-09-20",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      effectiveFrom: "2026-09-10",
      minutes: [240, 240, 240, 240, 240, 0, 0],
      fullDayMinutes: 240,
    },
  ]);
});

test("an own assignment gives an employee outside every group a working pattern", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  await seed.leaveGroups(employee.id);
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    effectiveUntil: "2026-09-30",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    { effectiveFrom: "2026-08-01", minutes: null, fullDayMinutes: null },
    { effectiveFrom: "2026-09-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: null, fullDayMinutes: null },
  ]);
});

test("group membership starts affecting working weeks on its own date", async ({ orm, seed }) => {
  const employee = await seed.employee();
  await seed.moveToGroup(employee.id, await seed.everyoneGroupId(), "2026-09-01");

  const weeks = await workingPatternService(orm).readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    { effectiveFrom: "2026-08-01", minutes: null, fullDayMinutes: null },
    { effectiveFrom: "2026-09-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
  ]);
});
