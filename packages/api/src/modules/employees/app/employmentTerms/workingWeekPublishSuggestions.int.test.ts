import {
  ADMIN,
  EMPLOYEE,
  expect,
  OWNER,
  seedEmploymentEnd,
  seedWorkingPattern,
  seedOwnWeek,
  test,
  workingPatternService,
  timeOffPolicyService,
} from "#test/support";

test("publish reach includes later joiners, excludes leavers and personal weeks, and sorts by name", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const zoe = await seed.employee({ firstName: "Zoe", lastName: "Able", startDate: "2025-01-01" });
  const amyZed = await seed.employee({
    firstName: "Amy",
    lastName: "Zed",
    startDate: "2026-12-01",
  });
  await seed.moveToTerms(amyZed.id, termsId, "2026-12-01");
  const amyAble = await seed.employee({
    firstName: "Amy",
    lastName: "Able",
    startDate: "2025-01-01",
  });
  const left = await seed.employee({ startDate: "2025-01-01" });
  await seedEmploymentEnd(orm, left.id, "2026-10-31");
  const personal = await seed.employee({ startDate: "2025-01-01" });
  const named = await seedWorkingPattern(orm, { minutes: [450, 0, 0, 0, 0, 0, 0] });
  await seedOwnWeek(orm, {
    employeeId: personal.id,
    versionId: named.versionId,
    startDate: "2026-01-01",
  });
  const draft = await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  const suggestions = await timeOffPolicyService(orm).readPublishSuggestions(ADMIN, {
    termsId,
    from: "2026-11-01",
  });

  expect(suggestions.versions).toEqual([{ id: draft.id, revision: 1, timeOffTypeId: null }]);
  expect(suggestions.owners).toHaveLength(1);
  expect(suggestions.owners[0]!.owner).toEqual({ termsId });
  expect(suggestions.owners[0]!.reached.map(({ id }) => id)).toEqual([
    amyAble.id,
    amyZed.id,
    zoe.id,
  ]);
});

test("an employee cannot read publish suggestions", async ({ orm, seed }) => {
  await expect(
    timeOffPolicyService(orm).readPublishSuggestions(EMPLOYEE, {
      termsId: await seed.defaultTermsId(),
      from: "2026-06-01",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
