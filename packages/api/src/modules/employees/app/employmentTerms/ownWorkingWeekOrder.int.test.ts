import {
  expect,
  OWNER,
  seedEmploymentEnd,
  seedOwnWeek,
  seedWorkingPattern,
  test,
  workingPatternService,
} from "#test/support";

test("keeps a planned own week when an earlier one is set after it", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-15",
    ...fourDays,
  });

  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...sevenHours,
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
    { source: "their_own", startDate: "2026-12-01", endDate: "2026-12-14", version: sevenHours },
    { source: "their_own", startDate: "2026-12-15", endDate: null, version: fourDays },
  ]);
});

test("keeps a later planned change when the first planned own week is cancelled", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...sevenHours,
  });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-15",
    ...fourDays,
  });

  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: "2026-12-14",
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
    { source: "their_own", startDate: "2026-12-15", endDate: null, version: fourDays },
  ]);
});

test("drops a planned own change for good when going back to the terms before it", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...sevenHours,
  });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2026-11-20" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-11-25",
    minutes: [360, 360, 360, 360, 360, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    { source: "their_own", startDate: "2026-11-09", endDate: "2026-11-19", version: sevenHours },
    {
      source: "from_their_terms",
      startDate: "2026-11-20",
      endDate: "2026-11-24",
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
    {
      source: "their_own",
      startDate: "2026-11-25",
      endDate: null,
      version: { minutes: [360, 360, 360, 360, 360, 0, 0] },
    },
  ]);
});

test("replaces a named pattern the person is on", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  const standard = await seedWorkingPattern(orm, { name: "Standard" });
  await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: standard.versionId,
    startDate: "2026-03-01",
  });

  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
    { source: "their_own", startDate: "2026-12-01", endDate: null, version: fourDays },
  ]);
});

test("refuses a date after the person leaves", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  await seedEmploymentEnd(orm, employee.id, "2026-11-30");
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.setOwnWorkingWeek(OWNER, {
      employeeId: employee.id,
      startDate: "2026-12-01",
      ...fourDays,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "after_leaving" }],
  });
});

const fourDays = {
  minutes: [480, 480, 480, 480, 0, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
const sevenHours = {
  minutes: [420, 420, 420, 420, 420, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
