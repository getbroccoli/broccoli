import {
  EMPLOYEE,
  expect,
  OWNER,
  readLeaveTerms,
  scotlandLeaveSetup,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

test.for([
  ["bankHolidayCalendar", "unknown"],
  ["workingWeek", "unknown"],
  ["annualLeavePolicyId", "00000000-0000-4000-8000-000000000001"],
] as const)(
  "refuses an unknown %s without changing terms or patterns",
  async ([field, value], { orm, transact }) => {
    const input = await scotlandLeaveSetup(orm);
    input.terms[1]![field] = value;
    const termsBefore = await readLeaveTerms(orm);
    const patternsBefore = await workingPatternService(orm).listPatterns(OWNER);

    await expect(
      transact((tx) => timeOffService(orm).turnOnLeave(OWNER, tx, input)),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field, code: "invalid" }],
    });

    expect(await readLeaveTerms(orm)).toEqual(termsBefore);
    expect(await workingPatternService(orm).listPatterns(OWNER)).toEqual(patternsBefore);
  },
);

test("refuses a record-only policy as Annual leave", async ({ orm, transact }) => {
  const service = timeOffService(orm);
  const input = await scotlandLeaveSetup(orm);
  input.terms[0]!.annualLeavePolicyId = (await service.listPolicies(OWNER, orm)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!.id;

  await expect(transact((tx) => service.turnOnLeave(OWNER, tx, input))).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "annualLeavePolicyId", code: "invalid" }],
  });
});

test("requires England and Wales even when another calendar is chosen", async ({
  orm,
  transact,
}) => {
  const input = await scotlandLeaveSetup(orm);
  input.terms = [input.terms[1]!];
  input.locationTerms = [];

  await expect(
    transact((tx) => timeOffService(orm).turnOnLeave(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "terms", code: "required" }],
  });
});

test("refuses two entries for one calendar", async ({ orm, transact }) => {
  const input = await scotlandLeaveSetup(orm);
  input.terms.push({ ...input.terms[0]! });

  await expect(
    transact((tx) => timeOffService(orm).turnOnLeave(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "terms", code: "duplicate" }],
  });
});

test("refuses a location's calendar without corresponding terms", async ({ orm, transact }) => {
  const input = await scotlandLeaveSetup(orm);
  input.locationTerms = [{ locationName: "Belfast", bankHolidayCalendar: "northern_ireland" }];

  await expect(
    transact((tx) => timeOffService(orm).turnOnLeave(OWNER, tx, input)),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "locationTerms", code: "invalid" }],
  });
});

test("refuses an employee turning leave on", async ({ orm, seed, transact }) => {
  const input = await scotlandLeaveSetup(orm);

  await expect(
    transact((tx) => timeOffService(orm).turnOnLeave(EMPLOYEE, tx, input)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(
    await timeOffService(orm).readTermsPolicies(OWNER, { termsId: await seed.defaultTermsId() }),
  ).toEqual([]);
});

test("a record-only policy on other terms already prevents turning leave on", async ({
  orm,
  seed,
  transact,
}) => {
  const service = timeOffService(orm);
  const otherTermsId = await seed.terms("Other terms");
  const sickness = (await service.listPolicies(OWNER, orm)).find(
    ({ typeKey }) => typeKey === "sickness",
  )!;
  await transact((tx) =>
    service.linkTermsPolicies(OWNER, tx, {
      termsId: otherTermsId,
      timeOffPolicyIds: [sickness.id],
    }),
  );
  const input = await scotlandLeaveSetup(orm);
  const termsBefore = await readLeaveTerms(orm);

  await expect(transact((tx) => service.turnOnLeave(OWNER, tx, input))).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Leave is already on.",
  });

  expect(await readLeaveTerms(orm)).toEqual(termsBefore);
  expect(await service.readTermsPolicies(OWNER, { termsId: otherTermsId })).toEqual([sickness]);
  expect(await service.readTermsPolicies(OWNER, { termsId: await seed.defaultTermsId() })).toEqual(
    [],
  );
});
