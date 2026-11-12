import {
  expect,
  giveTermsPolicies,
  OWNER,
  readOwnPatternAssignments,
  recordCloneService,
  seedOwnWeek,
  seedWorkingPattern,
  termsService,
  test,
  timeOffPolicyService,
  workingPatternService,
} from "#test/support";

test("publishing a working week keeps earlier days and a later unrelated assignment", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const original = (await termsService(orm).readTerms(OWNER, termsId))!.workingWeek[0]!.version;
  await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: original.id,
    startDate: "2026-01-01",
    endDate: "2026-09-30",
  });
  const unrelated = await seedWorkingPattern(orm, { minutes: [300, 300, 300, 300, 300, 0, 0] });
  const laterId = await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: unrelated.versionId,
    startDate: "2026-10-01",
  });
  const draft = await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [draft],
    startDate: "2026-07-01",
    owners: [{ termsId }, { employeeId: employee.id }],
  });

  const assignments = (await readOwnPatternAssignments(orm, [employee.id])).get(employee.id)!;
  expect(assignments).toHaveLength(3);
  expect(assignments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        versionId: original.id,
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      }),
      expect.objectContaining({
        versionId: draft.id,
        startDate: "2026-07-01",
        endDate: "2026-09-30",
      }),
      expect.objectContaining({
        id: laterId,
        versionId: unrelated.versionId,
        startDate: "2026-10-01",
        endDate: null,
      }),
    ]),
  );
  const weeks = await workingPatternService(orm).readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-06-01",
    until: "2026-12-31",
  });
  expect(weeks.get(employee.id)).toEqual([
    {
      startDate: "2026-06-01",
      minutes: original.minutes,
      bankHolidayCalendar: original.bankHolidayCalendar,
    },
    { startDate: "2026-07-01", minutes: draft.minutes, bankHolidayCalendar: "scotland" },
    {
      startDate: "2026-10-01",
      minutes: [300, 300, 300, 300, 300, 0, 0],
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("publishing reaches a person using an older version of the same working pattern", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const original = (await termsService(orm).readTerms(OWNER, termsId))!.workingWeek[0]!.version;
  await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: original.id,
    startDate: "2026-01-01",
  });
  const patterns = workingPatternService(orm);
  const policies = timeOffPolicyService(orm);
  const first = await patterns.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [420, 420, 420, 420, 420, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  await policies.publishTerms(OWNER, {
    termsId,
    versions: [first],
    startDate: "2026-01-01",
    owners: [{ termsId }],
  });
  const next = await patterns.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  await policies.publishTerms(OWNER, {
    termsId,
    versions: [next],
    startDate: "2026-07-01",
    owners: [{ employeeId: employee.id }],
  });

  expect((await readOwnPatternAssignments(orm, [employee.id])).get(employee.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        versionId: original.id,
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      }),
      expect.objectContaining({ versionId: next.id, startDate: "2026-07-01", endDate: null }),
    ]),
  );
  expect((await termsService(orm).readTerms(OWNER, termsId))!.workingWeek[0]!.version.id).toBe(
    first.id,
  );
});

test("a clone suggests only itself for its copied working week and rules", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const source = await seed.employee({ startDate: "2025-01-01" });
  const clone = await recordCloneService(orm, { today: "2026-06-01" }).cloneRecord(OWNER, {
    recordType: "terms",
    id: termsId,
    name: "Senior staff",
  });
  const member = await seed.employee({ startDate: "2025-01-01" });
  await seed.moveToTerms(member.id, clone.id);

  const suggestions = await timeOffPolicyService(orm).readPublishSuggestions(OWNER, {
    termsId: clone.id,
    from: "2026-06-01",
  });

  expect(suggestions.versions).toHaveLength(2);
  expect(suggestions.owners).toEqual([
    {
      owner: { termsId: clone.id },
      name: "Senior staff",
      versionIds: expect.arrayContaining(suggestions.versions.map(({ id }) => id)) as unknown,
      reached: [member],
    },
  ]);
  expect(suggestions.owners.flatMap(({ reached }) => reached.map(({ id }) => id))).not.toContain(
    source.id,
  );
});
