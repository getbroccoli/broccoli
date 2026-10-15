import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";

import { xlsxFile } from "#test/support";

import { type ColumnMapping, readFileRecords } from "./fileMapping";
import { readSheets } from "./sheet";

it("reads a CSV as one unnamed sheet", async () => {
  expect(await readSheets(Buffer.from("Name,Email\nAvery,avery@example.com"))).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery", "avery@example.com"],
      ],
    },
  ]);
});

it("reads a workbook as named sheets", async () => {
  const bytes = xlsxFile({
    sheets: [
      { name: "Staff", rows: [["Name"], ["Avery"]] },
      { name: "Contractors", rows: [["Email"], ["robin@example.com"]] },
    ],
  });

  expect(await readSheets(bytes)).toEqual([
    { name: "Staff", rows: [["Name"], ["Avery"]] },
    { name: "Contractors", rows: [["Email"], ["robin@example.com"]] },
  ]);
});

it("refuses a file containing a NUL byte as unsupported", async () => {
  expect(await readSheets(Buffer.from("Name\0"))).toBe("unsupported_file");
});

it("refuses a ZIP without a workbook as unsupported", async () => {
  expect(await readSheets(zipSync({ "staff.txt": strToU8("Avery") }))).toBe("unsupported_file");
});

it("refuses an empty file", async () => {
  expect(await readSheets(new Uint8Array())).toBe("empty");
});

it("refuses more than 10,000 CSV rows", async () => {
  const bytes = Buffer.from(
    Array.from({ length: 10_001 }, () => "Avery,avery@example.com").join("\n"),
  );

  expect(await readSheets(bytes)).toBe("too_many_rows");
});

it("refuses more than 100 CSV columns", async () => {
  expect(await readSheets(Buffer.from(Array.from({ length: 101 }, () => "Name").join(",")))).toBe(
    "too_many_columns",
  );
});

it("refuses more than 10 visible sheets", async () => {
  const bytes = xlsxFile({
    sheets: Array.from({ length: 11 }, (_, index) => ({
      name: `Staff ${index}`,
      rows: [["Name"]],
    })),
  });

  expect(await readSheets(bytes)).toBe("too_many_sheets");
});

it("counts rows across all sheets toward the row limit", async () => {
  const bytes = xlsxFile({
    sheets: [
      { name: "Staff", rows: Array.from({ length: 5_000 }, () => ["Avery"]) },
      { name: "Contractors", rows: Array.from({ length: 5_001 }, () => ["Robin"]) },
    ],
  });

  expect(await readSheets(bytes)).toBe("too_many_rows");
});

it("refuses a workbook with no values as empty", async () => {
  const bytes = xlsxFile({ sheets: [{ name: "Staff", rows: [[null], [" "]] }] });

  expect(await readSheets(bytes)).toBe("empty");
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

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
};
