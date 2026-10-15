import { expect, it } from "vitest";

import {
  columnQuestions,
  FILE_FIELDS,
  headerQuestion,
  readColumnMapping,
  readHeaderRow,
  sheetQuestions,
  type ColumnMapping,
} from "./fileMapping";

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
};

it("asks for the header and each field using the widest of the first ten rows", () => {
  const sheet = [
    ["Staff"],
    ...Array.from({ length: 8 }, () => ["Name", "Email"]),
    ["Avery Stone", "avery@example.com", "Designer"],
    ["Robin Reed", "robin@example.com", "Engineer", "2026-01-14"],
  ];

  const { questions } = sheetQuestions(sheet);

  expect(Object.keys(questions)).toEqual(["headerRow", ...FILE_FIELDS]);
  expect(questions.headerRow).toEqual(headerQuestion(sheet).questions.headerRow);
  for (const field of FILE_FIELDS) {
    expect(Object.keys(questions[field].options)).toEqual(["A", "B", "C", "none"]);
  }
});

it("shows only the first ten rows as header choices", () => {
  const sheet = Array.from({ length: 12 }, (_, index) => [`Row ${index + 1}`]);

  const { state, questions } = headerQuestion(sheet);

  expect(state).toEqual({
    rows: Object.fromEntries(sheet.slice(0, 10).map((row, index) => [String(index + 1), row])),
  });
  expect(Object.keys(questions.headerRow.options)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "none",
  ]);
});

it("cuts header-question cells to 100 characters", () => {
  expect(headerQuestion([["x".repeat(101)]]).state).toEqual({ rows: { "1": ["x".repeat(100)] } });
});

it("shows at most five samples below the chosen header", () => {
  const sheet = [
    ["Staff"],
    ["Name", "Email"],
    ...Array.from({ length: 6 }, (_, index) => [`Person ${index}`, `person${index}@example.com`]),
  ];

  const { state, questions } = columnQuestions(sheet, 1);

  expect(state).toEqual({
    columns: {
      A: { header: "Name", samples: ["Person 0", "Person 1", "Person 2", "Person 3", "Person 4"] },
      B: {
        header: "Email",
        samples: [
          "person0@example.com",
          "person1@example.com",
          "person2@example.com",
          "person3@example.com",
          "person4@example.com",
        ],
      },
    },
  });
  for (const question of Object.values(questions)) {
    expect(question.options).toEqual(LETTER_OPTIONS);
  }
});

it("shows the first five rows as samples and letter-only options without a header", () => {
  const sheet = Array.from({ length: 6 }, (_, index) => [
    `Person ${index}`,
    `person${index}@example.com`,
  ]);

  const { state, questions } = columnQuestions(sheet, null);

  expect(state).toEqual({
    columns: {
      A: { samples: ["Person 0", "Person 1", "Person 2", "Person 3", "Person 4"] },
      B: {
        samples: [
          "person0@example.com",
          "person1@example.com",
          "person2@example.com",
          "person3@example.com",
          "person4@example.com",
        ],
      },
    },
  });
  for (const question of Object.values(questions)) {
    expect(question.options).toEqual(LETTER_OPTIONS);
  }
});

it("cuts column headers and samples to 100 characters", () => {
  expect(columnQuestions([["h".repeat(101)], ["s".repeat(101)]], 0).state).toEqual({
    columns: {
      A: { header: "h".repeat(100), samples: ["s".repeat(100)] },
    },
  });
});

it("turns the header choice into a zero-based row index", () => {
  expect(readHeaderRow({ headerRow: { choice: "3", confidence: 0.95 } })).toBe(2);
});

it("returns no header when the model chooses none", () => {
  expect(readHeaderRow({ headerRow: { choice: "none", confidence: 0.95 } })).toBeNull();
});

it("returns no header for an unanswered question", () => {
  expect(readHeaderRow({ headerRow: null })).toBeNull();
});

it("keeps the higher-confidence field when two fields choose the same column", () => {
  expect(
    readColumnMapping({
      fullName: { choice: "A", confidence: 0.85 },
      firstName: { choice: "A", confidence: 0.95 },
      lastName: null,
      email: null,
      jobTitle: null,
      startDate: null,
    }),
  ).toEqual({ ...UNMAPPED, firstName: 0 });
});

it("refuses a mapping without a name or email column", () => {
  expect(
    readColumnMapping({
      fullName: { choice: "none", confidence: 0.95 },
      firstName: null,
      lastName: null,
      email: null,
      jobTitle: { choice: "A", confidence: 0.95 },
      startDate: null,
    }),
  ).toBeNull();
});

it("leaves unanswered fields unmapped", () => {
  expect(
    readColumnMapping({
      fullName: null,
      firstName: null,
      lastName: null,
      email: { choice: "B", confidence: 0.95 },
      jobTitle: null,
      startDate: null,
    }),
  ).toEqual({ ...UNMAPPED, email: 1 });
});

const LETTER_OPTIONS = { A: "Column A", B: "Column B", none: "No column holds this" };
