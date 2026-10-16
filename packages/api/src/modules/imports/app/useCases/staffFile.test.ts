import { readFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";

import { samplePdfFile, sampleXlsxFile } from "#test/support";

import { parseCsv } from "../../../../utils";
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

it("reads a two-page PDF as one unnamed sheet without its repeated header", async () => {
  const bytes = samplePdfFile({
    pages: [
      {
        texts: [
          { text: "Name", x: 40, y: 760 },
          { text: "Email", x: 200, y: 760 },
          { text: "Avery Stone", x: 40, y: 740 },
          { text: "avery@example.com", x: 200, y: 740 },
        ],
      },
      {
        texts: [
          { text: "Name", x: 40, y: 760 },
          { text: "Email", x: 200, y: 760 },
          { text: "Robin Reed", x: 40, y: 740 },
          { text: "robin@example.com", x: 200, y: 740 },
        ],
      },
    ],
  });

  expect(await readStaffFile(bytes)).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
        ["Robin Reed", "robin@example.com"],
      ],
    },
  ]);
});

it("refuses a text PDF without a table as unsupported", async () => {
  const bytes = samplePdfFile({
    pages: [{ texts: [{ text: "Staff directory", x: 40, y: 760 }] }],
  });

  expect(await readStaffFile(bytes)).toBe("unsupported_file");
});

it.for(["javascript-openaction", "embedded-file", "external-uri"])(
  "reads only the visible table from %s",
  async (name) => {
    const fixtures = new URL("../../../../../test/fixtures/pdf/", import.meta.url);
    const pdf = await readFile(new URL(`${name}.pdf`, fixtures));
    const csv = await readFile(new URL(`${name}.csv`, fixtures));
    const rows = parseCsv(csv);
    expect(rows).not.toBeNull();

    expect(await readStaffFile(pdf)).toEqual([{ name: null, rows }]);
  },
);

it("decides the stored media type from PDF, workbook and CSV content", () => {
  const pdf = samplePdfFile({ pages: [{}] });
  const workbook = sampleXlsxFile({ sheets: [{ name: "Staff", rows: [["Name"]] }] });

  expect(staffFileMimeType(pdf)).toBe("application/pdf");
  expect(staffFileMimeType(workbook)).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(staffFileMimeType(Buffer.from("Name,Email"))).toBe("text/csv");
});

it.for([
  { name: "an image-only scan", scan: { images: [{ x: 0, y: 0, width: 612, height: 792 }] } },
  {
    name: "a full-page scan with a visible page number",
    scan: {
      images: [{ x: 0, y: 0, width: 612, height: 792 }],
      texts: [{ text: "Page 2 of 2", x: 280, y: 20 }],
    },
  },
  {
    name: "a scan covering 40% of a page",
    scan: { images: [{ x: 0, y: 0, width: 612, height: 316.8 }] },
  },
  {
    name: "a tiled scan",
    scan: {
      images: [
        { x: 0, y: 0, width: 306, height: 396 },
        { x: 306, y: 0, width: 306, height: 396 },
        { x: 0, y: 396, width: 306, height: 396 },
        { x: 306, y: 396, width: 306, height: 396 },
      ],
    },
  },
  {
    name: "an OCR scan",
    scan: {
      images: [{ x: 0, y: 0, width: 612, height: 792 }],
      texts: tableTexts().map((text) => ({ ...text, invisible: true })),
    },
  },
])("refuses $name alone or after a valid table", { timeout: 15_000 }, async ({ scan }) => {
  const alone = samplePdfFile({ pages: [scan] });
  const afterTable = samplePdfFile({ pages: [{ texts: tableTexts() }, scan] });

  expect(await readStaffFile(alone)).toBe("scanned_pdf");
  expect(await readStaffFile(afterTable)).toBe("scanned_pdf");
});

it("refuses a PDF that needs a password to open", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/encrypted-refusal.pdf", import.meta.url),
  );

  expect(await readStaffFile(bytes)).toBe("encrypted_pdf");
});

it.for(["encrypted-owner-only", "logo-table", "one-person-letterhead"])(
  "reads the rows of %s like its CSV twin",
  async (name) => {
    const fixtures = new URL("../../../../../test/fixtures/pdf/", import.meta.url);
    const pdf = await readFile(new URL(`${name}.pdf`, fixtures));
    const csv = await readFile(new URL(`${name}.csv`, fixtures));
    const rows = parseCsv(csv);
    expect(rows).not.toBeNull();

    expect(await readStaffFile(pdf)).toEqual([{ name: null, rows }]);
  },
);

it.for([
  { name: "a small logo", image: { x: 40, y: 780, width: 50, height: 10 } },
  { name: "a full-page letterhead", image: { x: 0, y: 0, width: 612, height: 792 } },
])("reads a one-person table over $name", async ({ image }) => {
  const bytes = samplePdfFile({ pages: [{ texts: tableTexts(), images: [image] }] });

  expect(await readStaffFile(bytes)).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
      ],
    },
  ]);
});

it.for([
  "flate-decompression-bomb",
  "huge-image-under-cap",
  "scanned-refusal",
  "phone-photo-refusal",
  "mixed-text-scan-refusal",
  "ocr-scan-alone",
  "partial-scan-alone",
  "tiled-scan-alone",
  "fullpage-scan-native-label-alone",
  "text-table-plus-fullpage-scan",
  "text-table-plus-partial-scan",
  "text-table-plus-tiled-scan",
])("refuses %s as a scan", async (name) => {
  const bytes = await readFile(
    new URL(`../../../../../test/fixtures/pdf/${name}.pdf`, import.meta.url),
  );

  expect(await readStaffFile(bytes)).toBe("scanned_pdf");
});

function tableTexts() {
  return [
    { text: "Name", x: 40, y: 760 },
    { text: "Email", x: 200, y: 760 },
    { text: "Avery Stone", x: 40, y: 740 },
    { text: "avery@example.com", x: 200, y: 740 },
  ];
}

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
};
