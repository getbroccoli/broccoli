import { expect, it } from "vitest";

import { xlsxFile } from "#test/support";

import { readFileRecords, type ColumnMapping } from "./fileMapping";
import { readSheets } from "./sheet";

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
};

it("reads every row without a header with letter keys and one-based sheet ids", () => {
  const sheet = [
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
  ];

  const records = readFileRecords(sheet, null, { ...UNMAPPED, fullName: 0, email: 1 });

  expect(records).toEqual([
    {
      externalId: "row:1",
      raw: { A: "Avery Stone", B: "avery@example.com" },
      values: {
        firstName: "Avery",
        lastName: "Stone",
        email: "avery@example.com",
        jobTitle: null,
        startDate: null,
      },
    },
    {
      externalId: "row:2",
      raw: { A: "Robin Reed", B: "robin@example.com" },
      values: {
        firstName: "Robin",
        lastName: "Reed",
        email: "robin@example.com",
        jobTitle: null,
        startDate: null,
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

it("uses separate name columns ahead of the full name", () => {
  const [record] = readFileRecords(
    [
      ["Name", "First", "Last"],
      ["Ignored Name", "Avery", "Stone"],
    ],
    0,
    {
      ...UNMAPPED,
      fullName: 0,
      firstName: 1,
      lastName: 2,
    },
  );
  expect(record?.values).toMatchObject({ firstName: "Avery", lastName: "Stone" });
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
  expect(records.map(({ externalId }) => externalId)).toEqual(["row:4"]);
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

it("reads equal employee values from Excel dates and saved formulas and their CSV export", async () => {
  const workbook = xlsxFile({
    sheets: [
      {
        name: "Staff",
        rows: [
          ["Name", "Email", "Start date"],
          [
            "Avery Stone",
            { formula: 'LOWER("AVERY@EXAMPLE.COM")', value: "avery@example.com" },
            { date: "2024-04-03" },
          ],
          [
            "Robin Reed",
            { formula: 'LOWER("ROBIN@EXAMPLE.COM")', value: "robin@example.com" },
            { date: "2024-04-17" },
          ],
        ],
      },
    ],
  });
  const csv = Buffer.from(
    "Name,Email,Start date\nAvery Stone,avery@example.com,03/04/2024\nRobin Reed,robin@example.com,17/04/2024",
  );
  const mapping = { ...UNMAPPED, fullName: 0, email: 1, startDate: 2 };

  const excelSheets = await readSheets(workbook);
  const csvSheets = await readSheets(csv);

  expect(excelSheets).toHaveLength(1);
  expect(csvSheets).toHaveLength(1);
  if (typeof excelSheets === "string" || typeof csvSheets === "string") {
    throw new Error("The staff files must be readable");
  }
  const excelValues = readFileRecords(excelSheets[0]!.rows, 0, mapping).map(({ values }) => values);
  const csvValues = readFileRecords(csvSheets[0]!.rows, 0, mapping).map(({ values }) => values);
  expect(excelValues).toEqual(csvValues);
  expect(excelValues).toEqual([
    {
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: "2024-04-03",
    },
    {
      firstName: "Robin",
      lastName: "Reed",
      email: "robin@example.com",
      jobTitle: null,
      startDate: "2024-04-17",
    },
  ]);
});
