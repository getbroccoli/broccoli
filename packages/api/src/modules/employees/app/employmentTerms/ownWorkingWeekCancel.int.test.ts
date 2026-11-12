import { employeeServices, expect, OWNER, test, workingPatternService } from "#test/support";

test("cancels a planned own week", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
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
      endDate: null,
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
  ]);
});

test("cancels identical own weeks saved twice and restores the terms' week", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2027-01-01",
    ...fourDays,
  });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2027-07-01",
    ...fourDays,
  });

  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2027-01-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: null,
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
  ]);
});

test("cancels a planned change to an own week", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    bankHolidayCalendar: "england_and_wales",
    minutes: [420, 420, 420, 420, 420, 0, 0],
  });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-11-09",
      endDate: null,
      version: { minutes: [420, 420, 420, 420, 420, 0, 0] },
    },
  ]);
});

test("cancels a planned return to the terms", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...fourDays,
  });
  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2027-01-01" });

  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2027-01-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    { source: "their_own", startDate: "2026-11-09", endDate: null, version: fourDays },
  ]);
});

test.for([
  { reason: "started", startDate: "2026-03-01" },
  { reason: "does not exist", startDate: "2026-12-01" },
])("refuses to cancel an own-week change that $reason", async ({ startDate }, { orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...fourDays,
  });

  await expect(
    service.cancelOwnWorkingWeekChange(OWNER, { employeeId: employee.id, startDate }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });
});

test("cancels a planned own week after the person's start moves past it", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });
  await employeeServices(orm).updateEmployee(OWNER, {
    id: employee.id,
    startDate: "2027-01-01",
  });

  await service.cancelOwnWorkingWeekChange(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    { source: "from_their_terms", endDate: null },
  ]);
});

const fourDays = {
  minutes: [480, 480, 480, 480, 0, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
