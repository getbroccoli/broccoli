import { expect, importUseCases, SETUP_EXTERNAL_AGENT, SETUP_HOLDER, test } from "#test/support";

test("stores no mapping or employees when answers are refused", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_EXTERNAL_AGENT, tx, source.id, {
        sheets: [{ sheet: 1, answers: { ...ANSWERS, firstName: "A" } }],
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "sheets[0].answers.firstName", code: "same_column" }],
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, status: "mapping" },
  ]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
});

const CSV = "Name,Email\nAvery Stone,avery@example.com";
const ANSWERS = {
  headerRow: "1",
  fullName: "A",
  firstName: "none",
  lastName: "none",
  email: "B",
  jobTitle: "none",
  startDate: "none",
};
