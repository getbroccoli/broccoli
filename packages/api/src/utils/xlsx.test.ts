import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, expect, it, vi } from "vitest";

import { xlsxFile } from "#test/support";

import { parseXlsx } from ".";

const LIMITS = { maxRows: 10_000, maxColumns: 100 };

afterEach(() => vi.unstubAllEnvs());

it("trims text and reads numbers and booleans as strings", async () => {
  const bytes = xlsxFile({
    sheets: [{ name: "Staff", rows: [[" Avery & Robin ", 42, true, false]] }],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([
    { name: "Staff", rows: [["Avery & Robin", "42", "TRUE", "FALSE"]] },
  ]);
});

it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
  "reads date cells as ISO calendar dates in %s",
  async (timezone) => {
    vi.stubEnv("TZ", timezone);
    const bytes = xlsxFile({ sheets: [{ name: "Staff", rows: [[{ date: "2024-03-01" }]] }] });

    expect(await parseXlsx(bytes, LIMITS)).toEqual([{ name: "Staff", rows: [["2024-03-01"]] }]);
  },
);

it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
  "drops the time of day without shifting the date in %s",
  async (timezone) => {
    vi.stubEnv("TZ", timezone);
    const bytes = xlsxFile({
      sheets: [{ name: "Staff", rows: [[{ date: "2024-03-01T23:30:00Z" }]] }],
    });

    expect(await parseXlsx(bytes, LIMITS)).toEqual([{ name: "Staff", rows: [["2024-03-01"]] }]);
  },
);

it("reads a formula's saved value without evaluating it", async () => {
  const bytes = xlsxFile({
    sheets: [
      {
        name: "Staff",
        rows: [[{ formula: 'LOWER("AVERY@EXAMPLE.COM")', value: "avery@example.com" }]],
      },
    ],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([
    { name: "Staff", rows: [["avery@example.com"]] },
  ]);
});

it("reads a formula without a saved value as an empty cell", async () => {
  const bytes = xlsxFile({
    sheets: [{ name: "Staff", rows: [["Avery", { formula: "1+1" }, "Stone"]] }],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([
    { name: "Staff", rows: [["Avery", "", "Stone"]] },
  ]);
});

it("reads a formula error as an empty cell", async () => {
  const bytes = xlsxFile({
    sheets: [{ name: "Staff", rows: [["Avery", { formula: "NA()", error: "#N/A" }, "Stone"]] }],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([
    { name: "Staff", rows: [["Avery", "", "Stone"]] },
  ]);
});

it("skips hidden and very hidden sheets while keeping visible sheets in workbook order", async () => {
  const bytes = xlsxFile({
    sheets: [
      { name: "Staff", rows: [["Avery"]] },
      { name: "Leavers", hidden: "hidden", rows: [["Robin"]] },
      { name: "Contractors", rows: [["Sam"]] },
      { name: "Archive", hidden: "veryHidden", rows: [["Casey"]] },
    ],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([
    { name: "Staff", rows: [["Avery"]] },
    { name: "Contractors", rows: [["Sam"]] },
  ]);
});

it("drops rows without any value", async () => {
  const bytes = xlsxFile({
    sheets: [{ name: "Staff", rows: [[null], [" "], ["Avery"], [], ["Robin"]] }],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([{ name: "Staff", rows: [["Avery"], ["Robin"]] }]);
});

it("drops sheets without any value", async () => {
  const bytes = xlsxFile({
    sheets: [
      { name: "Empty", rows: [] },
      { name: "Blank", rows: [[null], [" "]] },
      { name: "Staff", rows: [["Avery"]] },
    ],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([{ name: "Staff", rows: [["Avery"]] }]);
});

it("refuses a value at XFD20000 before allocating a wide sheet", async () => {
  const bytes = xlsxFile({
    sheets: [
      {
        name: "Staff",
        xml: '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="20000"><c r="XFD20000"><v>1</v></c></row></sheetData></worksheet>',
      },
    ],
  });

  expect(await parseXlsx(bytes, LIMITS)).toBe("too_many_columns");
});

it("refuses a value at A20001 before allocating a tall sheet", async () => {
  const bytes = xlsxFile({
    sheets: [
      {
        name: "Staff",
        xml: '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="20001"><c r="A20001"><v>1</v></c></row></sheetData></worksheet>',
      },
    ],
  });

  expect(await parseXlsx(bytes, LIMITS)).toBe("too_many_rows");
});

it("allows a self-closing styled cell at the worksheet's farthest position", async () => {
  const bytes = xlsxFile({
    sheets: [
      {
        name: "Staff",
        xml: '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>42</v></c></row><row r="1048576"><c r="XFD1048576" s="1"/></row></sheetData></worksheet>',
      },
    ],
  });

  expect(await parseXlsx(bytes, LIMITS)).toEqual([{ name: "Staff", rows: [["42"]] }]);
});

it("refuses more than 64 MB of unpacked contents", async () => {
  const workbook = xlsxFile({ sheets: [{ name: "Staff", rows: [["Avery"]] }] });
  const bytes = zipSync(
    { ...unzipSync(workbook), "padding.bin": new Uint8Array(64 * 1024 * 1024 + 1) },
    { level: 1 },
  );

  expect(await parseXlsx(bytes, LIMITS)).toBe("unreadable");
});

it("refuses bytes that are not a ZIP", async () => {
  expect(await parseXlsx(Buffer.from("Name,Email"), LIMITS)).toBe("unreadable");
});

it("refuses a ZIP without a workbook", async () => {
  const bytes = zipSync({ "staff.txt": strToU8("Avery") });

  expect(await parseXlsx(bytes, LIMITS)).toBe("unreadable");
});
