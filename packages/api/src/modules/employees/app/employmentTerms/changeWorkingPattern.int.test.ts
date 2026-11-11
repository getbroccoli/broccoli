import {
  termsService,
  expect,
  OWNER,
  scotlandTimeOffSetup,
  test,
  timeOffService,
  timeOffPolicyService,
  workingPatternService,
} from "#test/support";

test("publishing a terms' week writes one history line with the old and new settings", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const draft = await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [{ id: draft.id, revision: draft.revision }],
    startDate: "2026-12-01",
    owners: [{ termsId }],
  });

  const page = await termsService(orm).readTermsHistory(OWNER, termsId, {});
  expect(page.edges).toHaveLength(1);
  const line = page.edges[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]!.field).toBe("workingWeek");
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: "2000-01-01",
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  expect(JSON.parse(line.changes[0]!.newValue!)).toEqual({
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
});

test("a working week cannot be published before the start of this year", async ({ orm, seed }) => {
  const termsId = await seed.defaultTermsId();
  const draft = await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  const before = await termsService(orm).readTerms(OWNER, termsId);

  await expect(
    timeOffPolicyService(orm).publishTerms(OWNER, {
      termsId,
      versions: [{ id: draft.id, revision: draft.revision }],
      startDate: "2025-12-31",
      owners: [{ termsId }],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });

  expect(await termsService(orm).readTerms(OWNER, termsId)).toEqual(before);
});

test("publishing one terms' week leaves another terms' week unchanged", async ({
  orm,
  transact,
}) => {
  await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, scotlandTimeOffSetup()));
  const [first, other] = await termsService(orm).listTerms(OWNER);
  expect(other).toBeDefined();
  const draft = await workingPatternService(orm).saveWorkingPattern(OWNER, {
    termsId: first!.id,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId: first!.id,
    versions: [{ id: draft.id, revision: draft.revision }],
    startDate: "2026-12-01",
    owners: [{ termsId: first!.id }],
  });

  expect(await termsService(orm).readTerms(OWNER, other!.id)).toEqual(other);
});
