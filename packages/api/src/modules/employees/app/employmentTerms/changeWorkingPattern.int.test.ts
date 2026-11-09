import {
  termsService,
  expect,
  OWNER,
  scotlandTimeOffSetup,
  test,
  timeOffService,
  workingPatternService,
} from "#test/support";

test("changing a terms' week writes one history line with the old and new settings", async ({
  orm,
  seed,
}) => {
  const termsId = await seed.defaultTermsId();
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const pattern = (await patterns.listPatterns(OWNER)).find((item) => item.termsId === termsId)!;
  const history = termsService(orm, { today: "2026-11-06" });

  await patterns.changePattern(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });

  const page = await history.readTermsHistory(OWNER, termsId, {});
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
    startDate: null,
    minutes: [450, 450, 450, 450, 450, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
  expect(JSON.parse(line.changes[0]!.newValue!)).toEqual({
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
});

test("a working week cannot change before the start of this year", async ({ orm }) => {
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const [pattern] = await patterns.listPatterns(OWNER);

  await expect(
    patterns.changePattern(OWNER, {
      workingPatternId: pattern!.id,
      startDate: "2025-12-31",
      minutes: [480, 480, 480, 480, 0, 0, 0],
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "startDate", code: "too_early" }],
  });

  expect(await patterns.listPatterns(OWNER)).toContainEqual(pattern);
});

test("changing one terms' week keeps the other terms' week unchanged", async ({
  orm,
  transact,
}) => {
  await transact((tx) =>
    timeOffService(orm, { today: "2026-11-06" }).turnOnTimeOff(OWNER, tx, scotlandTimeOffSetup()),
  );
  const patterns = workingPatternService(orm, { today: "2026-11-06" });
  const [first, other] = await patterns.listPatterns(OWNER);
  expect(other).toBeDefined();

  await patterns.changePattern(OWNER, {
    workingPatternId: first!.id,
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
  });

  expect(await patterns.listPatterns(OWNER)).toContainEqual(other);
});
