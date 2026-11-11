import {
  EMPLOYEE,
  expect,
  readWorkingPatterns,
  giveTermsPolicies,
  OWNER,
  readTermsPolicies,
  readTimeOffTerms,
  scotlandTimeOffSetup,
  test,
  timeOffService,
} from "#test/support";

test("requires terms for the chosen default nation without changing terms", async ({
  orm,
  transact,
}) => {
  const input = scotlandTimeOffSetup();
  input.defaultBankHolidayCalendar = "scotland";
  input.terms = [input.terms[0]!];
  input.locationTerms = [];
  const termsBefore = await readTimeOffTerms(orm);

  await expect(
    transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "terms", code: "required" }],
  });

  expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
});

test("refuses an unknown default nation without changing terms", async ({ orm, transact }) => {
  const input = scotlandTimeOffSetup();
  input.defaultBankHolidayCalendar = "unknown";
  const termsBefore = await readTimeOffTerms(orm);

  await expect(
    transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "defaultBankHolidayCalendar", code: "invalid" }],
  });

  expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
});

test.for([
  ["bankHolidayCalendar", "unknown"],
  ["workingWeek", "unknown"],
  ["annualLeavePolicyKey", "unknown"],
] as const)(
  "refuses an unknown %s without changing terms or patterns",
  async ([field, value], { orm, transact }) => {
    const input = scotlandTimeOffSetup();
    input.terms[1]![field] = value;
    const termsBefore = await readTimeOffTerms(orm);
    const patternsBefore = await readWorkingPatterns(orm);

    await expect(
      transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input)),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code: "invalid" }],
    });

    expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
    expect(await readWorkingPatterns(orm)).toEqual(patternsBefore);
  },
);

test("requires England and Wales even when another calendar is chosen", async ({
  orm,
  transact,
}) => {
  const input = scotlandTimeOffSetup();
  input.terms = [input.terms[1]!];
  input.locationTerms = [];

  await expect(
    transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "terms", code: "required" }],
  });
});

test("refuses two entries for one calendar", async ({ orm, transact }) => {
  const input = scotlandTimeOffSetup();
  input.terms.push({ ...input.terms[0]! });

  await expect(
    transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "terms", code: "duplicate" }],
  });
});

test("refuses a location's calendar without corresponding terms", async ({ orm, transact }) => {
  const input = scotlandTimeOffSetup();
  input.locationTerms = [{ locationName: "Belfast", bankHolidayCalendar: "northern_ireland" }];

  await expect(
    transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "locationTerms", code: "invalid" }],
  });
});

test("refuses an employee turning time off on", async ({ orm, seed, transact }) => {
  const input = scotlandTimeOffSetup();

  await expect(
    transact((tx) => timeOffService(orm).turnOnTimeOff(EMPLOYEE, tx, input)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await readTermsPolicies(orm, await seed.defaultTermsId())).toEqual([]);
});

test("a record-only policy on other terms already prevents turning time off on", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const otherTermsId = await seed.terms("Other terms");
  await giveTermsPolicies(orm, transact, {
    termsId: otherTermsId,
    policies: [{ recordOnly: "sickness" }],
  });
  const otherPolicies = await readTermsPolicies(orm, otherTermsId);
  const input = scotlandTimeOffSetup();
  const termsBefore = await readTimeOffTerms(orm);

  await expect(transact((tx) => service.turnOnTimeOff(OWNER, tx, input))).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Time off is already on.",
  });

  expect(await readTimeOffTerms(orm)).toEqual(termsBefore);
  expect(await readTermsPolicies(orm, otherTermsId)).toEqual(otherPolicies);
  expect(await readTermsPolicies(orm, await seed.defaultTermsId())).toEqual([]);
});
