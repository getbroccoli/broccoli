import {
  calendarDate,
  employeeServices,
  expect,
  finishSelfHostedSetup,
  importServices,
  instances,
  OWNER,
  readAllowances,
  readTermsPolicies,
  readTimeOffTerms,
  scotlandTimeOffSetup,
  SETUP_HOLDER,
  test,
  workingPatternService,
} from "#test/support";

test("finishing setup gives Glasgow and Leeds their chosen terms and Annual leave", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "glasgow@example.com", location: "Glasgow", startDate: calendarDate("2025-01-01") },
    { email: "leeds@example.com", location: "Leeds", startDate: calendarDate("2025-01-01") },
  ]);
  const imports = importServices(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const timeOff = scotlandTimeOffSetup();

  await finishSelfHostedSetup(orm, { timeOff });

  const employees = employeeServices(orm);
  const { edges } = await employees.listEmployees(OWNER, {});
  expect(edges).toHaveLength(2);
  const glasgow = edges.find(({ node }) => node.email === "glasgow@example.com")!.node;
  const leeds = edges.find(({ node }) => node.email === "leeds@example.com")!.node;
  const terms = await readTimeOffTerms(orm);
  const scotland = terms.find(({ name }) => name === "Scotland")!;
  expect(terms).toHaveLength(2);
  const memberships = await transact((tx) =>
    employees.readTermsMemberships(tx, [glasgow.id, leeds.id]),
  );
  expect(memberships.get(glasgow.id)).toEqual([
    { termsId: scotland.id, startDate: null, endDate: null },
  ]);
  expect(memberships.get(leeds.id)).toEqual([
    { termsId: await seed.defaultTermsId(), startDate: null, endDate: null },
  ]);
  const weeks = await workingPatternService(orm).readWorkingWeeks(OWNER, {
    employeeIds: [glasgow.id],
    from: "2026-01-01",
    until: "2026-12-31",
  });
  expect(weeks.get(glasgow.id)).toEqual([
    {
      startDate: "2026-01-01",
      minutes: [480, 480, 480, 480, 0, 0, 0],
      fullDayMinutes: 480,
      bankHolidayCalendar: "scotland",
    },
  ]);
  // 25 × 4/5 + 10 Scottish bank holidays × 4/5 − 7 falling Mon–Thu = 21 days.
  expect(await readAllowances(orm, glasgow.id)).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 21,
    },
  ]);
  expect(await readAllowances(orm, leeds.id)).toMatchObject([
    {
      typeKey: "annual_leave",
      leaveYearStart: "2026-01-01",
      leaveYearEnd: "2026-12-31",
      total: 20,
    },
  ]);
  // England and Wales on the UK statutory minimum, Scotland on 25 days plus bank holidays.
  for (const [termsId, entitlementDays] of [
    [await seed.defaultTermsId(), 28],
    [scotland.id, 25],
  ] as const) {
    const policies = await readTermsPolicies(orm, termsId);
    expect(policies).toHaveLength(4);
    expect(policies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeKey: "annual_leave", entitlementDays }),
        expect.objectContaining({ typeKey: "sickness", balance: "no_balance" }),
        expect.objectContaining({ typeKey: "family_leave", balance: "no_balance" }),
        expect.objectContaining({ typeKey: "other", balance: "no_balance" }),
      ]),
    );
  }
});

test("skipping time off finishes setup without policies, new terms or allowances", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ startDate: calendarDate("2025-01-01") }]);
  const imports = importServices(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const termsBefore = await readTimeOffTerms(orm);

  await finishSelfHostedSetup(orm, { timeOff: null });

  expect((await instances.readInstance(orm)).step).toBe("done");
  expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
  expect(await readTermsPolicies(orm, await seed.defaultTermsId())).toEqual([]);
  const { edges } = await employeeServices(orm).listEmployees(OWNER, {});
  expect(edges).toHaveLength(1);
  expect(await readAllowances(orm, edges[0]!.node.id)).toEqual([]);
});

test("a refused time off choice rolls back the people and keeps setup unfinished", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { location: "Glasgow", startDate: calendarDate("2025-01-01") },
  ]);
  const imports = importServices(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  const timeOff = scotlandTimeOffSetup();
  timeOff.terms[1]!.annualLeavePolicyKey = "unknown";
  const termsBefore = await readTimeOffTerms(orm);

  await expect(finishSelfHostedSetup(orm, { timeOff })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "annualLeavePolicyKey", code: "invalid" }],
  });

  expect((await employeeServices(orm).listEmployees(OWNER, {})).edges).toEqual([]);
  expect((await instances.readInstance(orm)).step).toBe("owner");
  expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
  expect(await readTermsPolicies(orm, await seed.defaultTermsId())).toEqual([]);
});
