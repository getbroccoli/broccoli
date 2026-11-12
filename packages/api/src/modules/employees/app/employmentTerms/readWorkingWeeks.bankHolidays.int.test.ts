import {
  expect,
  OWNER,
  test,
  workingPatternService,
  seedWorkingPattern,
  seedOwnWeek,
  timeOffPolicyService,
} from "#test/support";

test("assigning a Scotland pattern changes the calendar from its date despite identical hours", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const pattern = await seedWorkingPattern(orm, {
    name: "Standard Scotland",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: pattern.versionId,
    startDate: "2026-07-01",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-01-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-07-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "scotland",
    },
  ]);
});

test("changing only a pattern's calendar starts a new working week from its date", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const termsId = await seed.defaultTermsId();
  const draft = await patterns.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [{ id: draft.id, revision: draft.revision }],
    startDate: "2026-07-01",
    owners: [{ termsId }],
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-01-01",
    until: "2026-12-31",
  });

  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-01-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
    {
      startDate: "2026-07-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "scotland",
    },
  ]);
});
