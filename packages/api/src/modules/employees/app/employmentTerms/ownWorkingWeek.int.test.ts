import { EMPLOYEE, expect, OWNER, termsService, test, workingPatternService } from "#test/support";

test("gives a person their own week from a future date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-11-09",
      endDate: "2026-11-30",
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
    { source: "their_own", startDate: "2026-12-01", endDate: null, version: fourDays },
  ]);
});

test("changes a person's own week from a later date", async ({ orm, seed }) => {
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

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    { source: "their_own", startDate: "2026-11-09", endDate: "2026-11-30", version: sevenHours },
    { source: "their_own", startDate: "2026-12-01", endDate: null, version: fourDays },
  ]);
});

test("keeps a person's own week through a move to other terms", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  const scotland = await termsService(orm, { today: "2026-11-09" }).createTerms(OWNER, {
    name: "Scotland",
    bankHolidayCalendar: "scotland",
  });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...fourDays,
  });

  await service.changeTerms(OWNER, {
    employeeIds: [employee.id],
    termsId: scotland.id,
    startDate: "2026-12-01",
  });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    { source: "their_own", startDate: "2026-11-09", endDate: null, version: fourDays },
  ]);
});

test("puts a person back on their terms' week from a date", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-03-01",
    ...fourDays,
  });

  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2027-01-01" });

  const terms = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });
  expect(terms.get(employee.id)?.workingWeek).toMatchObject([
    { source: "their_own", startDate: "2026-11-09", endDate: "2026-12-31", version: fourDays },
    {
      source: "from_their_terms",
      startDate: "2027-01-01",
      endDate: null,
      version: { minutes: [450, 450, 450, 450, 450, 0, 0] },
    },
  ]);
});

test("drops a planned own week when going back before it starts", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });
  await service.setOwnWorkingWeek(OWNER, {
    employeeId: employee.id,
    startDate: "2026-12-01",
    ...fourDays,
  });

  await service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2026-11-20" });

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

test.for([
  { reason: "this leave year", employmentStart: "2024-03-01", startDate: "2025-12-31" },
  { reason: "the person's start", employmentStart: "2026-05-04", startDate: "2026-03-01" },
])("refuses an own week before $reason", async ({ employmentStart, startDate }, { orm, seed }) => {
  const employee = await seed.employee({ startDate: employmentStart });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.setOwnWorkingWeek(OWNER, { employeeId: employee.id, startDate, ...fourDays }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });
});

test("refuses going back to the terms without an own week", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.useTermsWorkingWeek(OWNER, { employeeId: employee.id, startDate: "2026-12-01" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "no_own_week" }],
  });
});

test("refuses an own week with no working day", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.setOwnWorkingWeek(OWNER, {
      employeeId: employee.id,
      startDate: "2026-12-01",
      bankHolidayCalendar: "england_and_wales",
      minutes: [0, 0, 0, 0, 0, 0, 0],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "minutes", code: "no_working_day" }],
  });
});

test("refuses a caller who is not an admin setting an own week", async ({ orm, seed }) => {
  const employee = await seed.employee({ startDate: "2024-03-01" });
  const service = workingPatternService(orm, { today: "2026-11-09" });

  await expect(
    service.setOwnWorkingWeek(EMPLOYEE, {
      employeeId: employee.id,
      startDate: "2026-12-01",
      ...fourDays,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

const fourDays = {
  minutes: [480, 480, 480, 480, 0, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
const sevenHours = {
  minutes: [420, 420, 420, 420, 420, 0, 0] as const,
  bankHolidayCalendar: "england_and_wales",
};
