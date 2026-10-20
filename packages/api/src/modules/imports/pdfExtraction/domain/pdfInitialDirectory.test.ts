import { expect, it } from "vitest";

import { line, page } from "#test/support";
import { pdfInitialDirectory } from "./pdfInitialDirectory";

it("reads parallel surname-initial entries and skips row, index, and room prefixes", () => {
  expect(
    pdfInitialDirectory([
      page([
        line(700, ["1 A STONE A. 1234", "BLDG.03.014 P REED R. 5678"]),
        line(680, ["2 B PARK K.4321", "RM.03.015 Q LEE J.9876"]),
      ]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Phone extension"],
    ["STONE A.", "1234"],
    ["REED R.", "5678"],
    ["PARK K.", "4321"],
    ["LEE J.", "9876"],
  ]);
});

it("reads an extension touching the final name initial", () => {
  expect(
    pdfInitialDirectory([
      page([line(700, ["PARK K.4321", "STONE A.1234"]), line(680, ["REED R.5678", "LEE J.9876"])]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Phone extension"],
    ["PARK K.", "4321"],
    ["STONE A.", "1234"],
    ["REED R.", "5678"],
    ["LEE J.", "9876"],
  ]);
});

it("does not treat section headings and numeric-only rows as people", () => {
  expect(
    pdfInitialDirectory([
      page([line(700, ["SECTION A", "OFFICE 1234"]), line(680, ["1", "1234"])]),
    ]),
  ).toBeNull();
});
