import { expect, it } from "vitest";

import { checkSheets, type FileSheet } from "./sheet";

it("keeps sheets within the limits", () => {
  const sheets: FileSheet[] = [{ name: null, rows: [["Name"], ["Avery"]] }];

  expect(checkSheets(sheets)).toEqual(sheets);
});

it("refuses sheets without any row as empty", () => {
  expect(checkSheets([{ name: "Staff", rows: [] }])).toBe("empty");
});

it("refuses more than 10 sheets", () => {
  const sheets = Array.from({ length: 11 }, (_, index) => ({
    name: `Staff ${index}`,
    rows: [["Name"]],
  }));

  expect(checkSheets(sheets)).toBe("too_many_sheets");
});

it("counts rows across all sheets toward the 10,000-row limit", () => {
  expect(
    checkSheets([
      { name: "Staff", rows: Array.from({ length: 5_000 }, () => ["Avery"]) },
      { name: "Contractors", rows: Array.from({ length: 5_001 }, () => ["Robin"]) },
    ]),
  ).toBe("too_many_rows");
});

it("refuses more than 100 columns", () => {
  expect(checkSheets([{ name: null, rows: [Array.from({ length: 101 }, () => "Name")] }])).toBe(
    "too_many_columns",
  );
});
