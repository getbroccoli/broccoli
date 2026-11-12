import { expect, OWNER, test, timeOffPolicyService, workingPatternService } from "#test/support";

test("returns one valid working week on the last calendar day after an ordinary publish", async ({
  orm,
  seed,
}) => {
  // Arrange: all stored assignments come from the public save/publish use cases.
  const termsId = await seed.terms();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(employee.id, termsId);
  const patterns = workingPatternService(orm);
  const draft = await patterns.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });

  // Act
  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "9999-12-31",
    until: "9999-12-31",
  });

  // Assert
  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "9999-12-31",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});
