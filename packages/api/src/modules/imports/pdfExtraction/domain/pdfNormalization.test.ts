import { expect, it } from "vitest";

import { dateOrderOf, normalizedRecord, type SourceRecord } from "./pdfNormalization";

it.each([
  ["Stone, Avery", "Avery", "Stone"],
  ["The Rev'd Dr Avery Stone", "Avery", "Stone"],
  ["Avery Stone, PhD", "Avery", "Stone"],
  ["AVERY J STONE", "Avery J", "Stone"],
  ["McAvery Stone", "McAvery", "Stone"],
  ["Stone A.", "A.", "Stone"],
  ["Avery van der Stone", "Avery", "van der Stone"],
  ["Avery", "Avery", null],
])("normalizes the whole name %j to %j / %j", (name, firstName, lastName) => {
  expect(normalizedRecord({ ...emptySource, name })).toEqual({
    firstName,
    lastName,
    email: null,
    jobTitle: null,
    startDate: null,
  });
});

it("keeps an explicitly missing given name instead of splitting the family name", () => {
  const source: SourceRecord = {
    ...emptySource,
    name: "Avery Stone",
    lastName: "van der Stone",
    nameSource: "separate",
  };

  expect(normalizedRecord(source)).toMatchObject({
    firstName: null,
    lastName: "van der Stone",
  });
});

it("keeps an explicitly missing family name instead of splitting the given name", () => {
  const source: SourceRecord = {
    ...emptySource,
    firstName: "Avery Robin",
    nameSource: "separate",
  };

  expect(normalizedRecord(source)).toMatchObject({ firstName: "Avery Robin", lastName: null });
});

it("trims and lowercases a complete email address", () => {
  expect(normalizedRecord({ ...emptySource, email: " AVERY@EXAMPLE.COM " }).email).toBe(
    "avery@example.com",
  );
});

it.each(["avery", "avery@", "avery@example", "avery @example.com"])(
  "leaves the incomplete email %j absent",
  (email) => {
    expect(normalizedRecord({ ...emptySource, email }).email).toBeNull();
  },
);

it("removes trailing punctuation from a complete job title", () => {
  expect(normalizedRecord({ ...emptySource, jobTitle: " Payroll Specialist.,;: " }).jobTitle).toBe(
    "Payroll Specialist",
  );
});

it("leaves a stand-in heading out of the job title", () => {
  expect(normalizedRecord({ ...emptySource, jobTitle: "Vertretung" }).jobTitle).toBeNull();
});

it("keeps an ISO date without a separate date order", () => {
  expect(normalizedRecord({ ...emptySource, startDate: "2021-02-03" }).startDate).toBe(
    "2021-02-03",
  );
});

it.each([
  { dateOrder: "dmy", expected: "2021-02-03" },
  { dateOrder: "mdy", expected: "2021-03-02" },
] as const)("reads a local date in the established $dateOrder order", ({ dateOrder, expected }) => {
  expect(normalizedRecord({ ...emptySource, startDate: "03.02.2021", dateOrder }).startDate).toBe(
    expected,
  );
});

it("does not invent a century for a two-digit year", () => {
  expect(
    normalizedRecord({ ...emptySource, startDate: "03.02.21", dateOrder: "dmy" }).startDate,
  ).toBeNull();
});

it("does not guess the order of a local date during normalization", () => {
  expect(normalizedRecord({ ...emptySource, startDate: "03.02.2021" }).startDate).toBeNull();
});

it.each(["31.02.2021", "29.02.2021", "00.02.2021"])(
  "refuses the impossible date %s",
  (startDate) => {
    expect(normalizedRecord({ ...emptySource, startDate, dateOrder: "dmy" }).startDate).toBeNull();
  },
);

it.each([
  ["03.02.2021", "dmy"],
  ["13/02/2021", "dmy"],
  ["02/13/2021", "mdy"],
  ["2021-02-03", "ymd"],
  ["02/03/2021", null],
  [null, null],
])("recognizes the date order of %j as %j", (value, expected) => {
  expect(dateOrderOf(value)).toBe(expected);
});

const emptySource: SourceRecord = {
  name: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
  nameSource: "combined",
  dateOrder: null,
};
