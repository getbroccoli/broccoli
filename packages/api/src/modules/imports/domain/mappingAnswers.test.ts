import { expect, it } from "vitest";

import { parseMappingAnswers, sheetQuestions } from ".";

it("requires an entry for every sheet", () => {
  expect(() => parseMappingAnswers([questions], { sheets: [] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "sheets", code: "missing_sheet" }],
    }),
  );
});

it("refuses an unknown sheet", () => {
  const input = {
    sheets: [
      { sheet: 1, answers: ANSWERS },
      { sheet: 2, answers: ANSWERS },
    ],
  };

  expect(() => parseMappingAnswers([questions], input)).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "sheets[1].sheet", code: "unknown_sheet" }],
    }),
  );
});

it("requires an answer for every question", () => {
  const answers: Record<string, string> = { ...ANSWERS };
  delete answers.email;

  expect(() => parseMappingAnswers([questions], { sheets: [{ sheet: 1, answers }] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "sheets[0].answers.email", code: "missing_answer" }],
    }),
  );
});

it("refuses an unknown choice", () => {
  const answers = { ...ANSWERS, email: "private@example.com" };

  expect(() => parseMappingAnswers([questions], { sheets: [{ sheet: 1, answers }] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "sheets[0].answers.email", code: "unknown_choice" }],
    }),
  );
});

it("refuses the second field assigned to the same column", () => {
  const answers = { ...ANSWERS, firstName: "A" };

  expect(() => parseMappingAnswers([questions], { sheets: [{ sheet: 1, answers }] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "sheets[0].answers.firstName", code: "same_column" }],
    }),
  );
});

const { questions } = sheetQuestions([
  ["Name", "Email"],
  ["Avery Stone", "avery@example.com"],
]);
const ANSWERS = {
  headerRow: "1",
  fullName: "A",
  firstName: "none",
  lastName: "none",
  email: "B",
  jobTitle: "none",
  startDate: "none",
};
