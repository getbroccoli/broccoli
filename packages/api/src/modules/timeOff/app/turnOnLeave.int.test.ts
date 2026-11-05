import {
  expect,
  OWNER,
  readAllowances,
  readLeaveTerms,
  scotlandLeaveSetup,
  SETUP_HOLDER,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

test("turning leave on twice refuses the second choice and keeps the first", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const input = await scotlandLeaveSetup(orm);
  await transact((tx) => service.turnOnLeave(OWNER, tx, input));
  const termsBefore = await readLeaveTerms(orm);
  const patternsBefore = await workingPatternService(orm).listPatterns(OWNER);
  const policiesBefore = await Promise.all(
    termsBefore.map(({ id }) => service.readTermsPolicies(OWNER, { termsId: id })),
  );
  const allowancesBefore = await readAllowances(orm, employee.id);
  input.terms[0]!.workingWeek = "monday_to_friday_8_hours";

  await expect(transact((tx) => service.turnOnLeave(OWNER, tx, input))).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Leave is already on.",
  });

  expect(await readLeaveTerms(orm)).toEqual(termsBefore);
  expect(await workingPatternService(orm).listPatterns(OWNER)).toEqual(patternsBefore);
  expect(
    await Promise.all(
      termsBefore.map(({ id }) => service.readTermsPolicies(OWNER, { termsId: id })),
    ),
  ).toEqual(policiesBefore);
  expect(await readAllowances(orm, employee.id)).toEqual(allowancesBefore);
});

test.for([
  ["monday_to_friday_8_hours", 480],
  ["monday_to_friday_7_hours", 420],
] as const)(
  "England and Wales on %s gets a new pattern without changing Standard",
  async ([workingWeek, minutes], { orm, seed, transact }) => {
    const patterns = workingPatternService(orm);
    const standard = (await patterns.listPatterns(OWNER)).find(({ isStandard }) => isStandard)!;
    const input = await scotlandLeaveSetup(orm);
    input.terms = [{ ...input.terms[0]!, workingWeek }];
    input.locationTerms = [];

    const result = await transact((tx) => timeOffService(orm).turnOnLeave(OWNER, tx, input));

    expect(result.termsIds).toEqual([await seed.defaultTermsId()]);
    expect(result.createdPatternIds).toHaveLength(1);
    const saved = await patterns.listPatterns(OWNER);
    expect(saved).toHaveLength(2);
    expect(saved.find(({ isStandard }) => isStandard)).toEqual(standard);
    expect(saved.find(({ id }) => id === result.createdPatternIds[0])).toMatchObject({
      isStandard: false,
      weeks: [
        {
          effectiveFrom: null,
          minutes: [minutes, minutes, minutes, minutes, minutes, 0, 0],
          fullDayMinutes: minutes,
          bankHolidayCalendar: "england_and_wales",
        },
      ],
    });
    expect(await readLeaveTerms(orm)).toMatchObject([
      {
        id: await seed.defaultTermsId(),
        patterns: [
          {
            workingPatternId: result.createdPatternIds[0],
            effectiveFrom: null,
            effectiveUntil: null,
          },
        ],
      },
    ]);
  },
);

test("the setup holder can turn leave on with the Standard week", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.setupStep("owner");
  const input = await scotlandLeaveSetup(orm);
  input.terms = [input.terms[0]!];
  input.locationTerms = [];
  const patternsBefore = await workingPatternService(orm).listPatterns(OWNER);

  const result = await transact((tx) => timeOffService(orm).turnOnLeave(SETUP_HOLDER, tx, input));

  expect(result).toEqual({
    termsIds: [await seed.defaultTermsId()],
    createdPatternIds: [],
    allowancesCreated: 0,
    linesAppended: 0,
  });
  expect(await workingPatternService(orm).listPatterns(OWNER)).toEqual(patternsBefore);
  expect(
    await timeOffService(orm).readTermsPolicies(OWNER, { termsId: await seed.defaultTermsId() }),
  ).toHaveLength(4);
});

test("Northern Ireland gets its calendar and terms in the requested order", async ({
  orm,
  seed,
  transact,
}) => {
  const input = await scotlandLeaveSetup(orm);
  input.terms = [{ ...input.terms[0]!, bankHolidayCalendar: "northern_ireland" }, input.terms[0]!];
  input.locationTerms = [];

  const result = await transact((tx) => timeOffService(orm).turnOnLeave(OWNER, tx, input));

  const terms = await readLeaveTerms(orm);
  const northernIreland = terms.find(({ name }) => name === "Northern Ireland")!;
  expect(result.termsIds).toEqual([northernIreland.id, await seed.defaultTermsId()]);
  expect(northernIreland.patterns).toMatchObject([
    { workingPatternId: result.createdPatternIds[0], effectiveFrom: null, effectiveUntil: null },
  ]);
  expect(await workingPatternService(orm).listPatterns(OWNER)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: result.createdPatternIds[0],
        weeks: [
          {
            effectiveFrom: null,
            minutes: [450, 450, 450, 450, 450, 0, 0],
            fullDayMinutes: 450,
            bankHolidayCalendar: "northern_ireland",
          },
        ],
      }),
    ]),
  );
});
