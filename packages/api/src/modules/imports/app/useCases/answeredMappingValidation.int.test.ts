import { expect, importUseCases, SETUP_AGENT, SETUP_HOLDER, test } from "#test/support";

test("requires an entry for every sheet", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_AGENT, tx, source.id, { sheets: [] }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "sheets", code: "missing_sheet" }],
  });

  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
});

test("refuses an unknown sheet", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_AGENT, tx, source.id, {
        sheets: [
          { sheet: 1, answers: ANSWERS },
          { sheet: 2, answers: ANSWERS },
        ],
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "sheets[1].sheet", code: "unknown_sheet" }],
  });

  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
});

test("requires an answer for every question", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);
  const answers: Record<string, string> = { ...ANSWERS };
  delete answers.email;

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_AGENT, tx, source.id, {
        sheets: [{ sheet: 1, answers }],
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "sheets[0].answers.email", code: "missing_answer" }],
  });

  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
});

test("refuses an unknown choice", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_AGENT, tx, source.id, {
        sheets: [{ sheet: 1, answers: { ...ANSWERS, email: "private@example.com" } }],
      }),
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "sheets[0].answers.email", code: "unknown_choice" }],
  });

  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
});

test("refuses the second field assigned to the same column", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_AGENT, tx, source.id, {
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
