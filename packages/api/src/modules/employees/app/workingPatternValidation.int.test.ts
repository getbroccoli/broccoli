import { expect, OWNER, test, workingPatternService } from "#test/support";

test("creating a pattern refuses a name already taken", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const input = { name: "Monday", minutes: [450, 0, 0, 0, 0, 0, 0] as const, fullDayMinutes: 450 };
  await patterns.createPattern(OWNER, input);

  await expect(patterns.createPattern(OWNER, input)).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });
});

test("renaming a pattern refuses a name already taken", async ({ orm }) => {
  const patterns = workingPatternService(orm);
  const pattern = await patterns.createPattern(OWNER, {
    name: "Monday",
    minutes: [450, 0, 0, 0, 0, 0, 0],
    fullDayMinutes: 450,
  });

  await expect(
    patterns.renamePattern(OWNER, { workingPatternId: pattern.id, name: "Standard" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "name", code: "taken" }],
  });
});
