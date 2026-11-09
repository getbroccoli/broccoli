import {
  expect,
  OWNER,
  seedTermsPeriods,
  signedIn,
  termsService,
  test,
  workingPatternService,
} from "#test/support";

test("reads a person's terms with their names oldest first, including a planned move", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const defaultId = await seed.defaultTermsId();
  const scotlandId = await seed.terms("Scotland");
  await seedTermsPeriods(orm, employee.id, [
    { termsId: scotlandId, startDate: "2026-09-01", endDate: null },
    { termsId: defaultId, startDate: null, endDate: "2026-08-31" },
  ]);

  const result = await workingPatternService(orm, { today: "2026-06-01" }).readEmploymentTerms(
    OWNER,
    {
      employeeIds: [employee.id],
    },
  );

  expect(result.get(employee.id)?.periods).toEqual([
    { termsId: defaultId, termsName: "England and Wales", startDate: null, endDate: "2026-08-31" },
    { termsId: scotlandId, termsName: "Scotland", startDate: "2026-09-01", endDate: null },
  ]);
});

test("reads today's week from the terms followed by the week after a planned move", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const scotland = await termsService(orm, { today: "2026-06-01" }).createTerms(OWNER, {
    name: "Scotland",
    bankHolidayCalendar: "scotland",
  });
  await seedTermsPeriods(orm, employee.id, [
    { termsId: await seed.defaultTermsId(), startDate: null, endDate: "2026-08-31" },
    { termsId: scotland.id, startDate: "2026-09-01", endDate: null },
  ]);

  const result = await workingPatternService(orm, { today: "2026-06-01" }).readEmploymentTerms(
    OWNER,
    {
      employeeIds: [employee.id],
    },
  );

  expect(result.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "from_their_terms",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      version: {
        minutes: [450, 450, 450, 450, 450, 0, 0],
        bankHolidayCalendar: "england_and_wales",
      },
    },
    {
      source: "from_their_terms",
      startDate: "2026-09-01",
      endDate: null,
      version: { minutes: [450, 450, 450, 450, 450, 0, 0], bankHolidayCalendar: "scotland" },
    },
  ]);
});

test("reads an own week until it ends, then the terms' week", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const service = workingPatternService(orm, { today: "2026-06-01" });
  const pattern = await service.createPattern(OWNER, {
    name: "Four days",
    minutes: [480, 480, 480, 480, 0, 0, 0],
  });
  await service.assignPattern(OWNER, {
    employeeId: employee.id,
    workingPatternId: pattern.id,
    startDate: "2026-06-01",
    endDate: "2026-08-31",
  });

  const result = await service.readEmploymentTerms(OWNER, { employeeIds: [employee.id] });

  expect(result.get(employee.id)?.workingWeek).toMatchObject([
    {
      source: "their_own",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      version: { minutes: [480, 480, 480, 480, 0, 0, 0], bankHolidayCalendar: "england_and_wales" },
    },
    {
      source: "from_their_terms",
      startDate: "2026-09-01",
      endDate: null,
      version: {
        minutes: [450, 450, 450, 450, 450, 0, 0],
        bankHolidayCalendar: "england_and_wales",
      },
    },
  ]);
});

test("leaves out a colleague whose working pattern the caller may not read", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const colleague = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, profiles: ["EMPLOYEE"] });

  const result = await workingPatternService(orm, { today: "2026-06-01" }).readEmploymentTerms(
    ctx,
    {
      employeeIds: [employee.id, colleague.id],
    },
  );

  expect([...result.keys()]).toEqual([employee.id]);
  expect(result.get(employee.id)?.workingWeek).toMatchObject([
    { source: "from_their_terms", startDate: "2026-06-01", endDate: null },
  ]);
});
