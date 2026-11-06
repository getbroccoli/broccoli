import { ADMIN, expect, OWNER, test, workingPatternService } from "#test/support";

test("an admin creates a pattern with one version applying from the beginning", async ({ orm }) => {
  const patterns = workingPatternService(orm);

  const pattern = await patterns.createPattern(ADMIN, {
    name: "Tuesday to Thursday",
    minutes: [0, 450, 450, 450, 0, 0, 0],
    fullDayMinutes: 450,
  });

  expect(pattern).toMatchObject({
    name: "Tuesday to Thursday",
    termsId: null,
    versions: [
      {
        startDate: null,
        endDate: null,
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

  expect(pattern.versions).toMatchObject([
    {
      startDate: null,
      endDate: null,
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(pattern);
});

test("changing minutes on an existing date preserves that week's calendar", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find(
    (pattern) => pattern.termsId !== null,
  )!;
  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    startDate: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
    bankHolidayCalendar: "scotland",
  });

  const changed = await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    startDate: "2026-09-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 450,
  });

  expect(changed.versions).toMatchObject([
    {
      startDate: null,
      endDate: "2026-08-31",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-09-01",
      endDate: null,
      minutes: [420, 420, 420, 420, 420, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});

test("removing a pattern version restores the one before it", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find(
    (pattern) => pattern.termsId !== null,
  )!;
  await patterns.changePattern(OWNER, {
    workingPatternId: standard.id,
    startDate: "2026-09-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  const changed = await patterns.removePatternVersion(OWNER, {
    workingPatternId: standard.id,
    startDate: "2026-09-01",
  });

  expect(changed.versions).toEqual(standard.versions);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});

test("a terms' pattern can be neither renamed nor deleted on its own", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find(
    (pattern) => pattern.termsId !== null,
  )!;

  await expect(
    patterns.renamePattern(OWNER, { workingPatternId: standard.id, name: "Full time" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    patterns.deletePattern(OWNER, { workingPatternId: standard.id }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await patterns.listPatterns(OWNER)).toContainEqual(standard);
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
    startDate: "2026-09-01",
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
      startDate: "2026-09-01",
      minutes: [450, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removePatternVersion(OWNER, { workingPatternId, startDate: "2026-09-01" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(patterns.deletePattern(OWNER, { workingPatternId })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("removing a date without a pattern version leaves its first version intact", async ({
  orm,
}) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find(
    (pattern) => pattern.termsId !== null,
  )!;

  await expect(
    patterns.removePatternVersion(OWNER, {
      workingPatternId: standard.id,
      startDate: "2026-09-01",
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
    startDate: "2026-10-01",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
    bankHolidayCalendar: "northern_ireland",
  });

  const changed = await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2026-07-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 450,
  });

  expect(changed.versions).toMatchObject([
    {
      startDate: null,
      endDate: "2026-06-30",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
    {
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      minutes: [420, 420, 420, 420, 420, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "scotland",
    },
    {
      startDate: "2026-10-01",
      endDate: null,
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "northern_ireland",
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});

test("a change before a later version ends the day before that version", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Changing week",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2027-01-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  const changed = await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2026-06-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 420,
  });

  expect(changed.versions).toMatchObject([
    { startDate: null, endDate: "2026-05-31", minutes: [450, 450, 450, 450, 450, 0, 0] },
    { startDate: "2026-06-01", endDate: "2026-12-31", minutes: [420, 420, 420, 420, 420, 0, 0] },
    { startDate: "2027-01-01", endDate: null, minutes: [480, 480, 480, 480, 480, 0, 0] },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});

test("removing a version extends the one before it to the removed one's end", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Changing week",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2026-06-01",
    minutes: [420, 420, 420, 420, 420, 0, 0],
    fullDayMinutes: 420,
  });
  await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2027-01-01",
    minutes: [480, 480, 480, 480, 480, 0, 0],
    fullDayMinutes: 480,
  });

  const changed = await patterns.removePatternVersion(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2026-06-01",
  });

  expect(changed.versions).toMatchObject([
    { startDate: null, endDate: "2026-12-31", minutes: [450, 450, 450, 450, 450, 0, 0] },
    { startDate: "2027-01-01", endDate: null, minutes: [480, 480, 480, 480, 480, 0, 0] },
  ]);
  expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
});
