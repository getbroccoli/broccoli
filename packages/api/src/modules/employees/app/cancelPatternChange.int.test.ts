import { termsService, expect, OWNER, test, workingPatternService } from "#test/support";

test("cancelling a terms' planned week writes one history line for the cancelled settings", async ({
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
    bankHolidayCalendar: "england_and_wales",
  });
  const before = await history.readTermsHistory(OWNER, termsId, {});

  const changed = await patterns.cancelPatternChange(OWNER, {
    workingPatternId: pattern.id,
    startDate: "2026-12-01",
  });

  expect(changed.versions).toEqual(pattern.versions);
  const page = await history.readTermsHistory(OWNER, termsId, {});
  const added = page.edges.filter(
    ({ node }) => !before.edges.some((edge) => edge.node.id === node.id),
  );
  expect(added).toHaveLength(1);
  const line = added[0]!.node;
  expect(line).toMatchObject({
    recordType: "terms",
    recordId: termsId,
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
  });
  expect(line.changes).toHaveLength(1);
  expect(line.changes[0]).toMatchObject({ field: "workingWeek", newValue: null });
  expect(JSON.parse(line.changes[0]!.oldValue!)).toEqual({
    startDate: "2026-12-01",
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "england_and_wales",
  });
});

test.for(["2026-11-05", "2026-11-06"])(
  "a working week that started on %s cannot be cancelled",
  async (startDate, { orm }) => {
    const patterns = workingPatternService(orm, { today: "2026-11-06" });
    const [pattern] = await patterns.listPatterns(OWNER);
    const changed = await patterns.changePattern(OWNER, {
      workingPatternId: pattern!.id,
      startDate,
      minutes: [480, 480, 480, 480, 0, 0, 0],
    });

    await expect(
      patterns.cancelPatternChange(OWNER, { workingPatternId: pattern!.id, startDate }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "This change has already started." });

    expect(await patterns.listPatterns(OWNER)).toContainEqual(changed);
  },
);
