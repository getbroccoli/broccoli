import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";

import { samplePdfFile, sampleXlsxFile } from "#test/support";

import { type ColumnMapping, readFileRecords } from "../../domain";
import { readStaffFile, staffFileMimeType } from "./staffFile";

it("reads a CSV as one unnamed sheet", async () => {
  expect(await readStaffFile(Buffer.from("Name,Email\nAvery,avery@example.com"))).toEqual([
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
  const bytes = sampleXlsxFile({
    sheets: [
      { name: "Staff", rows: [["Name"], ["Avery"]] },
      { name: "Contractors", rows: [["Email"], ["robin@example.com"]] },
    ],
  });

  expect(await readStaffFile(bytes)).toEqual([
    { name: "Staff", rows: [["Name"], ["Avery"]] },
    { name: "Contractors", rows: [["Email"], ["robin@example.com"]] },
  ]);
});

it("refuses a file containing a NUL byte as unsupported", async () => {
  expect(await readStaffFile(Buffer.from("Name\0"))).toBe("unsupported_file");
});

it("refuses a ZIP without a workbook as unsupported", async () => {
  expect(await readStaffFile(zipSync({ "staff.txt": strToU8("Avery") }))).toBe("unsupported_file");
});

it("refuses a workbook over the limits", async () => {
  const bytes = sampleXlsxFile({
    sheets: Array.from({ length: 11 }, (_, index) => ({
      name: `Staff ${index}`,
      rows: [["Name"]],
    })),
  });

  expect(await readStaffFile(bytes)).toBe("too_many_sheets");
});

it("reads equal employee values from Excel dates and saved formulas and their CSV export", async () => {
  const workbook = sampleXlsxFile({
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

  const excelSheets = await readStaffFile(workbook);
  const csvSheets = await readStaffFile(csv);

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

it("decides the stored media type from PDF, workbook and CSV content", () => {
  const pdf = samplePdfFile({ pages: [{}] });
  const workbook = sampleXlsxFile({ sheets: [{ name: "Staff", rows: [["Name"]] }] });

  expect(staffFileMimeType(pdf)).toBe("application/pdf");
  expect(staffFileMimeType(workbook)).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(staffFileMimeType(Buffer.from("Name,Email"))).toBe("text/csv");
});

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
};
