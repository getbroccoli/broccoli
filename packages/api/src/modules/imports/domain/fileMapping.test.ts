import { expect, it } from "vitest";

import { readColumnMapping, readFileRecords, type ColumnMapping } from "./fileMapping";

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
  manager: null,
  externalRecordId: null,
};

it("keeps the higher-confidence field when two fields choose the same column", () => {
  expect(
    readColumnMapping({
      fullName: { choice: "A", confidence: 0.85 },
      firstName: { choice: "A", confidence: 0.95 },
      lastName: null,
      email: null,
      jobTitle: null,
      startDate: null,
      manager: null,
      externalRecordId: null,
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
      manager: null,
      externalRecordId: null,
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
      manager: null,
      externalRecordId: null,
    }),
  ).toEqual({ ...UNMAPPED, email: 1 });
});

it("reads every row without a header with letter keys and one-based sheet ids", () => {
  const sheet = [
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
  ];

  const records = readFileRecords(sheet, null, { ...UNMAPPED, fullName: 0, email: 1 });

  expect(records).toEqual([
    {
      externalRecordId: null,
      sourceKey: "row:1",
      raw: { A: "Avery Stone", B: "avery@example.com" },
      values: {
        firstName: "Avery",
        lastName: "Stone",
        email: "avery@example.com",
        jobTitle: null,
        startDate: null,
        manager: null,
      },
    },
    {
      externalRecordId: null,
      sourceKey: "row:2",
      raw: { A: "Robin Reed", B: "robin@example.com" },
      values: {
        firstName: "Robin",
        lastName: "Reed",
        email: "robin@example.com",
        jobTitle: null,
        startDate: null,
        manager: null,
      },
    },
  ]);
});

it("splits a full name into given and middle names and a surname", () => {
  const [record] = readFileRecords([["Name"], ["Avery Robin Stone"]], 0, {
    ...UNMAPPED,
    fullName: 0,
  });
  expect(record?.values).toMatchObject({ firstName: "Avery Robin", lastName: "Stone" });
});

it("uses separate name columns instead of the full name, even where they are blank", () => {
  const records = readFileRecords(
    [
      ["Name", "First", "Last"],
      ["Ignored Name", "Avery", "Stone"],
      ["Vacant", "", ""],
    ],
    0,
    {
      ...UNMAPPED,
      fullName: 0,
      firstName: 1,
      lastName: 2,
    },
  );
  expect(records.map(({ values }) => values)).toMatchObject([
    { firstName: "Avery", lastName: "Stone" },
  ]);
});

it("leaves an invalid email empty", () => {
  const [record] = readFileRecords(
    [
      ["Name", "Email"],
      ["Avery Stone", "not-an-email"],
    ],
    0,
    { ...UNMAPPED, fullName: 0, email: 1 },
  );
  expect(record?.values.email).toBeNull();
});

it("reads start dates using the order of the whole column", () => {
  const records = readFileRecords(
    [
      ["Name", "Joined"],
      ["Avery Stone", "02/03/2026"],
      ["Robin Reed", "14/01/2026"],
    ],
    0,
    { ...UNMAPPED, fullName: 0, startDate: 1 },
  );
  expect(records.map(({ values }) => values.startDate)).toEqual(["2026-03-02", "2026-01-14"]);
});

it("skips rows without a name or a valid email", () => {
  const records = readFileRecords(
    [
      ["Name", "Email"],
      ["", "not-an-email"],
      ["Avery Stone", ""],
      ["", "robin@example.com"],
    ],
    0,
    { ...UNMAPPED, fullName: 0, email: 1 },
  );
  expect(
    records.map(({ values }) => ({ firstName: values.firstName, email: values.email })),
  ).toEqual([
    { firstName: "Avery", email: null },
    { firstName: null, email: "robin@example.com" },
  ]);
});

it("uses the row's one-based sheet position as the external id", () => {
  const records = readFileRecords([["Staff"], ["Name"], [""], ["Avery Stone"]], 1, {
    ...UNMAPPED,
    fullName: 0,
  });
  expect(records.map(({ sourceKey }) => sourceKey)).toEqual(["row:4"]);
});

it("keys raw cells by header, giving blank and repeated headers distinct keys", () => {
  const [record] = readFileRecords(
    [
      ["Name", "", "Name"],
      ["Avery Stone", "Designer", "Robin Reed"],
    ],
    0,
    { ...UNMAPPED, fullName: 0 },
  );
  expect(record?.raw).toEqual({ Name: "Avery Stone", B: "Designer", "Name (2)": "Robin Reed" });
});

it("keeps raw cells beyond the header's width under their column letters", () => {
  const [record] = readFileRecords(
    [["Name"], ["Avery Stone", "avery@example.com", "Designer"]],
    0,
    { ...UNMAPPED, fullName: 0 },
  );

  expect(record?.raw).toEqual({
    Name: "Avery Stone",
    B: "avery@example.com",
    C: "Designer",
  });
});

it("keeps all raw cells when a header collides with a repeated header's suffix", () => {
  const [record] = readFileRecords(
    [
      ["Name", "Name", "Name (2)"],
      ["Avery Stone", "Robin Reed", "Sam Vale"],
    ],
    0,
    { ...UNMAPPED, fullName: 0 },
  );

  const raw = record!.raw as Record<string, string>;
  expect(Object.keys(raw)).toHaveLength(3);
  expect(Object.values(raw)).toEqual(["Avery Stone", "Robin Reed", "Sam Vale"]);
});

it("reads the manager column as a trimmed reference", () => {
  const [record] = readFileRecords([["Avery Stone", "  Reed, Robin  "]], null, {
    ...UNMAPPED,
    fullName: 0,
    manager: 1,
  });

  expect(record?.values.manager).toBe("Reed, Robin");
});

it("reads the person's own ID separately from the manager reference", () => {
  const [record] = readFileRecords([["Avery Stone", "  EMP-17  "]], null, {
    ...UNMAPPED,
    fullName: 0,
    externalRecordId: 1,
  });

  expect(record?.externalRecordId).toBe("EMP-17");
});

it("leaves blank manager and own-ID cells empty", () => {
  const [record] = readFileRecords([["Avery Stone", "  ", ""]], null, {
    ...UNMAPPED,
    fullName: 0,
    manager: 1,
    externalRecordId: 2,
  });

  expect(record?.values.manager).toBeNull();
  expect(record?.externalRecordId).toBeNull();
});
