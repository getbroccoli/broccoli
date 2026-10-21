import { expect, test } from "vitest";

import { ApplicationError } from "../../../core/applicationError";
import { MAX_READ_PEOPLE, parseReadPeople, readPeopleSchema } from "./readPeople";

test.each([
  ["a non-object body", null],
  ["an array body", []],
  ["missing people", {}],
  ["people that are not an array", { people: "Avery Stone" }],
  ["an empty list", { people: [] }],
])("refuses %s", (_description, body) => {
  expect(() => parseReadPeople(body)).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "people", code: "required" }],
    }),
  );
});

test("refuses more than 10,000 people", () => {
  const people = Array.from({ length: 10_001 }, () => ({ firstName: "Avery" }));

  expect(() => parseReadPeople({ people })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "people", code: "too_many" }],
    }),
  );
});

test.each([
  ["a null person", null],
  ["a string person", "Avery Stone"],
  ["an array person", ["Avery"]],
  ["an unknown field", { firstName: "Avery", salary: "private value" }],
])("refuses %s at its list position", (_description, person) => {
  const body = { people: [{ firstName: "Avery" }, {}, {}, person] };

  expect(() => parseReadPeople(body)).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "people[3]", code: "unknown_field" }],
    }),
  );
});

test.each([
  ["a non-string value", 42],
  ["a null value", null],
  ["a value over 200 characters", "a".repeat(201)],
  ["a value containing NUL", "avery\u0000@example.com"],
])("refuses %s", (_description, email) => {
  expect(() => parseReadPeople({ people: [{ email }] })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "people[0].email", code: "invalid" }],
    }),
  );
});

test("reports invalid fields without echoing personal values", () => {
  const email = "avery\u0000@example.com";

  let failure: unknown;
  try {
    parseReadPeople({ people: [{ email }] });
  } catch (error) {
    failure = error;
  }

  expect(failure).toBeInstanceOf(ApplicationError);
  expect(String(failure)).not.toContain("avery");
  expect(JSON.stringify(failure)).not.toContain("avery");
});

test("keeps separate names ahead of the full name and preserves the original person", () => {
  const person = {
    firstName: "Avery",
    lastName: "Stone",
    fullName: "Robin Reed",
    email: "avery@example.com",
    jobTitle: "Designer",
    startDate: "2026-10-21",
  };

  expect(parseReadPeople({ people: [person] })).toEqual({
    records: [
      {
        externalId: "person:1",
        raw: person,
        values: {
          firstName: "Avery",
          lastName: "Stone",
          email: "avery@example.com",
          jobTitle: "Designer",
          startDate: "2026-10-21",
        },
      },
    ],
    skipped: 0,
  });
});

test.each([
  ["given names first", ["Avery Stone", "Robin Reed"]],
  ["family names first", ["Stone, Avery", "Reed, Robin"]],
])("reads full names with %s", (_description, names) => {
  const result = parseReadPeople({ people: names.map((fullName) => ({ fullName })) });

  expect(result.records.map(({ values }) => values)).toEqual([
    { firstName: "Avery", lastName: "Stone", email: null, jobTitle: null, startDate: null },
    { firstName: "Robin", lastName: "Reed", email: null, jobTitle: null, startDate: null },
  ]);
});

test("lowercases email addresses", () => {
  const result = parseReadPeople({ people: [{ email: "Avery@EXAMPLE.COM" }] });

  expect(result.records[0]!.values.email).toBe("avery@example.com");
});

test("leaves unreadable email addresses empty", () => {
  const result = parseReadPeople({ people: [{ firstName: "Avery", email: "not an email" }] });

  expect(result.records[0]!.values.email).toBeNull();
});

test("reads a calendar start date", () => {
  const result = parseReadPeople({ people: [{ firstName: "Avery", startDate: "2026-10-21" }] });

  expect(result.records[0]!.values.startDate).toBe("2026-10-21");
});

test.each(["sometime", "2026-02-30"])("leaves an unreadable start date empty: %s", (startDate) => {
  const result = parseReadPeople({ people: [{ firstName: "Avery", startDate }] });

  expect(result.records[0]!.values.startDate).toBeNull();
});

test("turns blank fields into null", () => {
  const result = parseReadPeople({
    people: [{ firstName: "Avery", lastName: " ", email: "", jobTitle: "  ", startDate: "" }],
  });

  expect(result.records[0]!.values).toEqual({
    firstName: "Avery",
    lastName: null,
    email: null,
    jobTitle: null,
    startDate: null,
  });
});

test("skips and counts people without a name or email", () => {
  const result = parseReadPeople({
    people: [{}, { jobTitle: "Designer" }, { firstName: "Avery" }],
  });

  expect(result.skipped).toBe(2);
  expect(result.records).toHaveLength(1);
});

test("numbers records by their original list positions including skipped people", () => {
  const result = parseReadPeople({ people: [{ firstName: "Avery" }, {}, { firstName: "Robin" }] });

  expect(result.records.map(({ externalId }) => externalId)).toEqual(["person:1", "person:3"]);
});

test("accepts 10,000 people and strings of 200 characters through the shared schema", () => {
  const body = {
    people: Array.from({ length: 10_000 }, () => ({
      firstName: "Avery",
      jobTitle: "a".repeat(200),
    })),
  };

  expect(MAX_READ_PEOPLE).toBe(10_000);
  expect(readPeopleSchema.safeParse(body).success).toBe(true);
  expect(parseReadPeople(body).records).toHaveLength(10_000);
});
