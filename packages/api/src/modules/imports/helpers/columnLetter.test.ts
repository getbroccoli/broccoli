import { expect, it } from "vitest";

import { columnIndex, columnLetter } from "./columnLetter";

it("converts zero-based indexes to spreadsheet letters across Z", () => {
  expect(columnLetter(0)).toBe("A");
  expect(columnLetter(25)).toBe("Z");
  expect(columnLetter(26)).toBe("AA");
  expect(columnLetter(27)).toBe("AB");
});

it("converts spreadsheet letters to zero-based indexes across Z", () => {
  expect(columnIndex("A")).toBe(0);
  expect(columnIndex("Z")).toBe(25);
  expect(columnIndex("AA")).toBe(26);
  expect(columnIndex("AB")).toBe(27);
});
