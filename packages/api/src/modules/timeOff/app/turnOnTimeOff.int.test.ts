import {
  expect,
  OWNER,
  readAllowances,
  readTermsPolicies,
  readTimeOffTerms,
  scotlandTimeOffSetup,
  SETUP_HOLDER,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

test("a Scotland default gives people without a location Scotland's calendar on the seeded week", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const patterns = workingPatternService(orm);
  const input = scotlandTimeOffSetup();
  input.defaultBankHolidayCalendar = "scotland";
  input.terms = [{ ...input.terms[1]!, workingWeek: "monday_to_friday_7_5_hours" }];
  input.locationTerms = [];

  const result = await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));

  expect(result.createdPatternIds).toEqual([]);
  expect(await readTimeOffTerms(orm)).toMatchObject([
    {
      id: await seed.defaultTermsId(),
      key: "default_terms",
      name: "Scotland",
      pattern: {
        versions: [
          {
            startDate: null,
            endDate: null,
            minutes: [450, 450, 450, 450, 450, 0, 0],
            bankHolidayCalendar: "scotland",
          },
        ],
      },
    },
  ]);
  expect(await patterns.listPatterns(OWNER)).toHaveLength(1);
  const weeks = await patterns.readWorkingWeeks(OWNER, {
    employeeIds: [employee.id],
    from: "2026-01-01",
    until: "2026-12-31",
  });
  expect(weeks.get(employee.id)).toMatchObject([{ bankHolidayCalendar: "scotland" }]);
});

test("turning time off on takes Annual leave defaults from the default nation and leaves other types not counting", async ({
  orm,
  transact,
}) => {
  const input = scotlandTimeOffSetup();
  input.defaultBankHolidayCalendar = "scotland";
  input.locationTerms = [];
  const service = timeOffService(orm);

  await transact((tx) => service.turnOnTimeOff(OWNER, tx, input));

  const { timeOffTypes } = await service.listTimeOffTypes(OWNER);
  expect(
    timeOffTypes.map(({ timeOffType }) => ({
      typeKey: timeOffType.typeKey,
      defaultRules: timeOffType.defaultRules,
    })),
  ).toEqual([
    {
      typeKey: "annual_leave",
      defaultRules: {
        balance: "balance_from_allowance",
        entitlementDays: 25,
        bankHolidays: "bank_holidays_on_top_of_allowance",
      },
    },
    ...["sickness", "family_leave", "other"].map((typeKey) => ({
      typeKey,
      defaultRules: { balance: "no_balance", entitlementDays: null, bankHolidays: null },
    })),
  ]);
});

test("turning time off on twice refuses the second choice and keeps the first", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee({ startDate: "2025-01-01" });
  const service = timeOffService(orm);
  const input = scotlandTimeOffSetup();
  await transact((tx) => service.turnOnTimeOff(OWNER, tx, input));
  const termsBefore = await readTimeOffTerms(orm);
  const patternsBefore = await workingPatternService(orm).listPatterns(OWNER);
  const policiesBefore = await Promise.all(termsBefore.map(({ id }) => readTermsPolicies(orm, id)));
  const allowancesBefore = await readAllowances(orm, employee.id);
  input.terms[0]!.workingWeek = "monday_to_friday_8_hours";

  await expect(transact((tx) => service.turnOnTimeOff(OWNER, tx, input))).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Time off is already on.",
  });

  expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
  expect(await workingPatternService(orm).listPatterns(OWNER)).toEqual(patternsBefore);
  expect(await Promise.all(termsBefore.map(({ id }) => readTermsPolicies(orm, id)))).toEqual(
    policiesBefore,
  );
  expect(await readAllowances(orm, employee.id)).toEqual(allowancesBefore);
});

test.for([
  ["monday_to_friday_8_hours", 480],
  ["monday_to_friday_7_hours", 420],
] as const)(
  "England and Wales on %s puts the default terms' own pattern on that week",
  async ([workingWeek, minutes], { orm, seed, transact }) => {
    const input = scotlandTimeOffSetup();
    input.terms = [{ ...input.terms[0]!, workingWeek }];
    input.locationTerms = [];

    const result = await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));

    expect(result).toMatchObject({
      termsIds: [await seed.defaultTermsId()],
      createdPatternIds: [],
    });
    expect(await readTimeOffTerms(orm)).toMatchObject([
      {
        id: await seed.defaultTermsId(),
        pattern: {
          versions: [
            {
              startDate: null,
              endDate: null,
              minutes: [minutes, minutes, minutes, minutes, minutes, 0, 0],
              bankHolidayCalendar: "england_and_wales",
            },
          ],
        },
      },
    ]);
  },
);

test("the setup holder can turn time off on with the seeded week", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.setupStep("owner");
  const input = scotlandTimeOffSetup();
  input.terms = [input.terms[0]!];
  input.locationTerms = [];
  const patternsBefore = await workingPatternService(orm).listPatterns(OWNER);

  const result = await transact((tx) => timeOffService(orm).turnOnTimeOff(SETUP_HOLDER, tx, input));

  expect(result).toEqual({
    termsIds: [await seed.defaultTermsId()],
    createdPatternIds: [],
    allowancesCreated: 0,
    linesAppended: 0,
  });
  expect(await workingPatternService(orm).listPatterns(OWNER)).toEqual(patternsBefore);
  expect(await readTermsPolicies(orm, await seed.defaultTermsId())).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ typeKey: "annual_leave", entitlementDays: 28 }),
      expect.objectContaining({ typeKey: "sickness", balance: "no_balance" }),
      expect.objectContaining({ typeKey: "family_leave", balance: "no_balance" }),
      expect.objectContaining({ typeKey: "other", balance: "no_balance" }),
    ]),
  );
});

test("Northern Ireland gets its own pattern and terms in the requested order", async ({
  orm,
  seed,
  transact,
}) => {
  const input = scotlandTimeOffSetup();
  input.terms = [{ ...input.terms[0]!, bankHolidayCalendar: "northern_ireland" }, input.terms[0]!];
  input.locationTerms = [];

  const result = await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input));

  const terms = await readTimeOffTerms(orm);
  const northernIreland = terms.find(({ name }) => name === "Northern Ireland")!;
  expect(result.termsIds).toEqual([northernIreland.id, await seed.defaultTermsId()]);
  expect(northernIreland.pattern).toMatchObject({
    id: result.createdPatternIds[0],
    termsId: northernIreland.id,
    name: null,
    versions: [
      {
        startDate: null,
        endDate: null,
        minutes: [450, 450, 450, 450, 450, 0, 0],
        bankHolidayCalendar: "northern_ireland",
      },
    ],
  });
});
