import { ADMIN, expect, OWNER, test, workingPatternService } from "#test/support";

test("an admin creates a pattern with one week applying from the beginning", async ({ orm }) => {
  const patterns = workingPatternService(orm);

  const pattern = await patterns.createPattern(ADMIN, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
    fullDayMinutes: 450,
  });

  expect(pattern).toMatchObject({
    name: "Tuesday to Thursday",
    isStandard: false,
    weeks: [
      {
        effectiveFrom: null,
        minutes: [0, 450, 450, 450, 0, 0, 0],
        fullDayMinutes: 450,
        bankHolidayCalendar: "england_and_wales",
      },
    ],
  });
  expect(await patterns.listPatterns(ADMIN)).toContainEqual(pattern);
});

test("creating a pattern keeps its chosen bank holiday calendar", async ({ orm }) => {
  const patterns = workingPatternService(orm);

  const pattern = await patterns.createPattern(OWNER, {
    name: "Standard Scotland",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
    bankHolidayCalendar: "scotland",
  });

  expect(pattern.weeks).toEqual([
    {
      effectiveFrom: null,
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(pattern);
});

test("changing minutes on an existing date preserves that week's calendar", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
    bankHolidayCalendar: "scotland",
  });

  const changed = await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 450,
  });

  expect(changed.weeks).toEqual([
    {
      effectiveFrom: null,
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
    {
      effectiveFrom: "2026-09-01",
      minutes: [420, 420, 420, 420, 420, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});

test("removing a pattern week preserves the initial week", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  const changed = await patterns.removePatternWeek(OWNER, {
    workingPatternId: standard.id,
    effectiveFrom: "2026-09-01",
  });

  expect(changed.weeks).toEqual(standard.weeks);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});

test("renaming Standard preserves its identity and weeks", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;

  const renamed = await patterns.renamePattern(OWNER, {
    workingPatternId: standard.id,
    name: "Full time",
  });

  expect(renamed).toEqual({ ...standard, name: "Full time" });
  expect(await patterns.listPatterns(OWNER)).toContainEqual(renamed);
  await expect(
    patterns.deletePattern(OWNER, { workingPatternId: renamed.id }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test("deleting an unused pattern removes it from the list", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Unused",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });

  await patterns.deletePattern(OWNER, { workingPatternId: pattern.id });

  expect((await patterns.listPatterns(OWNER)).map(({ id }) => id)).not.toContain(pattern.id);
});

test("a pattern assigned to an employee cannot be deleted", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-01",
  });

  await expect(
    patterns.deletePattern(OWNER, { workingPatternId: pattern.id }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await patterns.listPatterns(OWNER)).toContainEqual(pattern);
});

test("a pattern linked to empty terms cannot be deleted", async ({ orm, seed }) => {
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setTermsPattern(OWNER, {
    termsId: await seed.terms(),
    workingPatternId: pattern.id,
    effectiveFrom: "2026-09-01",
  });

  await expect(
    patterns.deletePattern(OWNER, { workingPatternId: pattern.id }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await patterns.listPatterns(OWNER)).toContainEqual(pattern);
});

test("pattern changes refuse an unknown pattern", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const workingPatternId = "00000000-0000-4000-8000-000000000001";

  await expect(
    patterns.renamePattern(OWNER, { workingPatternId, name: "Missing" }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    patterns.changePattern(OWNER, {
      workingPatternId,
      effectiveFrom: "2026-09-01",
      minutes: [450, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removePatternWeek(OWNER, { workingPatternId, effectiveFrom: "2026-09-01" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(patterns.deletePattern(OWNER, { workingPatternId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("removing a date without a pattern week leaves its first week intact", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;

  await expect(
    patterns.removePatternWeek(OWNER, {
      workingPatternId: standard.id,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect(await patterns.listPatterns(OWNER)).toContainEqual(standard);
});

test("changing minutes keeps the calendar in effect on that date despite a later calendar change", async ({
  orm,
}) => {
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Standard Scotland",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
    bankHolidayCalendar: "scotland",
  });
  await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    effectiveFrom: "2026-10-01",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
    bankHolidayCalendar: "northern_ireland",
  });

  const changed = await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    effectiveFrom: "2026-07-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 450,
  });

  expect(changed.weeks).toEqual([
    {
      effectiveFrom: null,
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
    {
      effectiveFrom: "2026-07-01",
      minutes: [420, 420, 420, 420, 420, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
    {
      effectiveFrom: "2026-10-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "northern_ireland",
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});
