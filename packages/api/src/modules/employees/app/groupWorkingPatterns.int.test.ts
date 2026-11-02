import { expect, OWNER, test, workingPatternService } from "#test/support";

test("a dated group switch changes only its members without their own assignment", async ({
  orm,
  seed,
}) => {
  const member = await seed.employee();
  const assigned = await seed.employee();
  const outsider = await seed.employee();
  const policyGroupId = await seed.policyGroup();
  await seed.moveToGroup(member.id, policyGroupId);
  await seed.moveToGroup(assigned.id, policyGroupId);
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setGroupPattern(OWNER, {
    policyGroupId,
    workingPatternId: standard.id,
    effectiveFrom: "2026-08-01",
  });
  await patterns.assignPattern(OWNER, {
    employeeId: assigned.id,
    workingPatternId: standard.id,
    effectiveFrom: "2026-08-01",
  });

  await patterns.setGroupPattern(OWNER, {
    policyGroupId,
    workingPatternId: monday.id,
    effectiveFrom: "2026-09-01",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [member.id, assigned.id, outsider.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });
  const unchanged = [
    {
      effectiveFrom: "2026-08-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
    },
  ];
  expect(weeks.get(member.id)).toEqual([
    ...unchanged,
    { effectiveFrom: "2026-09-01", minutes: [450, 0, 0, 0, 0, 0, 0], fullDayMinutes: 450 },
  ]);
  expect(weeks.get(assigned.id)).toEqual(unchanged);
  expect(weeks.get(outsider.id)).toEqual(unchanged);
});

test("correcting a group link keeps the later link and its boundary", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const policyGroupId = await seed.everyoneGroupId();
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  const friday = await patterns.createPattern(OWNER, {
    name: "Friday",
    minutes: [0, 0, 0, 0, 450, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setGroupPattern(OWNER, {
    policyGroupId,
    workingPatternId: monday.id,
    effectiveFrom: "2026-09-01",
  });
  await patterns.setGroupPattern(OWNER, {
    policyGroupId,
    workingPatternId: standard.id,
    effectiveFrom: "2026-10-01",
  });

  await patterns.setGroupPattern(OWNER, {
    policyGroupId,
    workingPatternId: friday.id,
    effectiveFrom: "2026-09-01",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });
  expect(weeks.get(employee.id)).toEqual([
    { effectiveFrom: "2026-08-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: [0, 0, 0, 0, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
  ]);
});

test("ending a group pattern leaves its members without a pattern from the next day", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);

  await patterns.endGroupPattern(OWNER, {
    policyGroupId: await seed.everyoneGroupId(),
    effectiveUntil: "2026-09-30",
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
    { effectiveFrom: "2026-09-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-10-01", minutes: null, fullDayMinutes: null },
  ]);
});

test("removing a dated group link leaves a gap without reopening the earlier link", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const policyGroupId = await seed.everyoneGroupId();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setGroupPattern(OWNER, {
    policyGroupId,
    workingPatternId: monday.id,
    effectiveFrom: "2026-09-01",
  });

  await patterns.removeGroupPattern(OWNER, { policyGroupId, effectiveFrom: "2026-09-01" });

  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-08-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    { effectiveFrom: "2026-08-01", minutes: [450, 450, 450, 450, 450, 0, 0], fullDayMinutes: 450 },
    { effectiveFrom: "2026-09-01", minutes: null, fullDayMinutes: null },
  ]);
});

test("a group link requires an existing pattern and group", async ({ orm, seed }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  const missingId = "00000000-0000-4000-8000-000000000001";

  await expect(
    patterns.setGroupPattern(OWNER, {
      policyGroupId: await seed.everyoneGroupId(),
      workingPatternId: missingId,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "workingPatternId", code: "not_found" }],
  });
  await expect(
    patterns.setGroupPattern(OWNER, {
      policyGroupId: missingId,
      workingPatternId: standard.id,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "policyGroupId", code: "not_found" }],
  });
});

test("ending or removing a group pattern requires a link on that date", async ({ orm, seed }) => {
  const patterns = workingPatternService(orm);
  const policyGroupId = await seed.policyGroup();

  await expect(
    patterns.endGroupPattern(OWNER, {
      policyGroupId,
      effectiveUntil: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removeGroupPattern(OWNER, {
      policyGroupId,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
