import { expect, OWNER, test, workingPatternService } from "#test/support";

test("a dated terms switch changes only their people without their own assignment", async ({
  orm,
  seed,
}) => {
  const member = await seed.employee();
  const assigned = await seed.employee();
  const outsider = await seed.employee();
  const termsId = await seed.terms();
  await seed.moveToTerms(member.id, termsId);
  await seed.moveToTerms(assigned.id, termsId);
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setTermsPattern(OWNER, {
    termsId,
    workingPatternId: standard.id,
    effectiveFrom: "2026-08-01",
  });
  await patterns.assignPattern(OWNER, {
    employeeId: assigned.id,
    workingPatternId: standard.id,
    effectiveFrom: "2026-08-01",
  });

  await patterns.setTermsPattern(OWNER, {
    termsId,
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
      bankHolidayCalendar: "england_and_wales",
    },
  ];
  expect(weeks.get(member.id)).toEqual([
    ...unchanged,
    {
      effectiveFrom: "2026-09-01",
      minutes: [450, 0, 0, 0, 0, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
  expect(weeks.get(assigned.id)).toEqual(unchanged);
  expect(weeks.get(outsider.id)).toEqual(unchanged);
});

test("correcting a terms link keeps the later link and its boundary", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const termsId = await seed.defaultTermsId();
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
  await patterns.setTermsPattern(OWNER, {
    termsId,
    workingPatternId: monday.id,
    effectiveFrom: "2026-09-01",
  });
  await patterns.setTermsPattern(OWNER, {
    termsId,
    workingPatternId: standard.id,
    effectiveFrom: "2026-10-01",
  });

  await patterns.setTermsPattern(OWNER, {
    termsId,
    workingPatternId: friday.id,
    effectiveFrom: "2026-09-01",
  });

  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-08-01",
    until: "2026-10-31",
  });
  expect(weeks.get(employee.id)).toEqual([
    {
      effectiveFrom: "2026-08-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
    {
      effectiveFrom: "2026-09-01",
      minutes: [0, 0, 0, 0, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
    {
      effectiveFrom: "2026-10-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
  ]);
});

test("ending a terms pattern leaves their people without a pattern from the next day", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);

  await patterns.endTermsPattern(OWNER, {
    termsId: await seed.defaultTermsId(),
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
    {
      effectiveFrom: "2026-09-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
    { effectiveFrom: "2026-10-01", minutes: null, fullDayMinutes: null, bankHolidayCalendar: null },
  ]);
});

test("removing a dated terms link leaves a gap without reopening the earlier link", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const termsId = await seed.defaultTermsId();
  const patterns = workingPatternService(orm);
  const monday = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });
  await patterns.setTermsPattern(OWNER, {
    termsId,
    workingPatternId: monday.id,
    effectiveFrom: "2026-09-01",
  });

  await patterns.removeTermsPattern(OWNER, { termsId, effectiveFrom: "2026-09-01" });

  expect(
    (
      await patterns.readWorkingWeeks(OWNER, {
        employeeIds: [employee.id],
        from: "2026-08-01",
        until: "2026-10-31",
      })
    ).get(employee.id),
  ).toEqual([
    {
      effectiveFrom: "2026-08-01",
      minutes: [450, 450, 450, 450, 450, 0, 0],
      fullDayMinutes: 450,
      bankHolidayCalendar: "england_and_wales",
    },
    { effectiveFrom: "2026-09-01", minutes: null, fullDayMinutes: null, bankHolidayCalendar: null },
  ]);
});

test("a terms link requires an existing pattern and terms", async ({ orm, seed }) => {
  const patterns = workingPatternService(orm);
  const standard = (await patterns.listPatterns(OWNER)).find((pattern) => pattern.isStandard)!;
  const missingId = "00000000-0000-4000-8000-000000000001";

  await expect(
    patterns.setTermsPattern(OWNER, {
      termsId: await seed.defaultTermsId(),
      workingPatternId: missingId,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "workingPatternId", code: "not_found" }],
  });
  await expect(
    patterns.setTermsPattern(OWNER, {
      termsId: missingId,
      workingPatternId: standard.id,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "termsId", code: "not_found" }],
  });
});

test("ending or removing a terms pattern requires a link on that date", async ({ orm, seed }) => {
  const patterns = workingPatternService(orm);
  const termsId = await seed.terms();

  await expect(
    patterns.endTermsPattern(OWNER, {
      termsId,
      effectiveUntil: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    patterns.removeTermsPattern(OWNER, {
      termsId,
      effectiveFrom: "2026-09-01",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
