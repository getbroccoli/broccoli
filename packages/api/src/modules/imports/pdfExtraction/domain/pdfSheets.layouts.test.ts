import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from "./pdfSheets";

/** A cell of `text` centred on `centre`, 5 pt per character. */
function centred(text: string, centre: number, y: number) {
  return { text, x: centre - text.length * 2.5, y, width: text.length * 5, height: 10 };
}

it("reads columns centred under their header", () => {
  expect(
    pdfSheets([
      page([
        ["Name", "Role", "Email"].map((text, index) => centred(text, 100 + index * 180, 700)),
        ["Avery Abbott", "Engineer", "avery@example.com"].map((text, index) =>
          centred(text, 100 + index * 180, 680),
        ),
        ["Blair Bell", "Office Manager", "blair@example.com"].map((text, index) =>
          centred(text, 100 + index * 180, 660),
        ),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Role", "Email"],
        ["Avery Abbott", "Engineer", "avery@example.com"],
        ["Blair Bell", "Office Manager", "blair@example.com"],
      ],
    },
  ]);
});

it("reads tables printed side by side under one header as separate tables", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Faculty", "Room", "Staff", "Room"], 0, -20),
        line(680, ["Avery Abbott", "A 101", "Blair Bell", "B 202"], 0, -20),
        line(660, ["Casey Cole", "A 102"], 0, -20),
      ]),
    ]),
  ).toEqual([
    {
      name: "Table 1",
      rows: [
        ["Faculty", "Room"],
        ["Avery Abbott", "A 101"],
        ["Casey Cole", "A 102"],
      ],
    },
    {
      name: "Table 2",
      rows: [
        ["Staff", "Room"],
        ["Blair Bell", "B 202"],
      ],
    },
  ]);
});

it("joins side-by-side halves with the same header into one table", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Room", "Name", "Room"], 0, -20),
        line(680, ["Avery Abbott", "A 101", "Blair Bell", "B 202"], 0, -20),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Room"],
        ["Avery Abbott", "A 101"],
        ["Blair Bell", "B 202"],
      ],
    },
  ]);
});

it("puts ascending numbers in front of names in a column of their own", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Room"]),
        line(680, ["1 Abbott, Avery", "A 101"]),
        line(660, ["2 Bell, Blair", "B 202"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["No.", "Name", "Room"],
        ["1", "Abbott, Avery", "A 101"],
        ["2", "Bell, Blair", "B 202"],
      ],
    },
  ]);
});

it("keeps numbers that do not ascend in their values", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Address", "Name"]),
        line(680, ["12 High Street", "Avery Abbott"]),
        line(660, ["3 Low Road", "Blair Bell"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Address", "Name"],
        ["12 High Street", "Avery Abbott"],
        ["3 Low Road", "Blair Bell"],
      ],
    },
  ]);
});

it("refuses org-chart boxes whose centres only roughly line up", () => {
  expect(
    pdfSheets([
      page([
        [centred("Frau Avery Abbott-", 50, 700), centred("Herr Blair Bell", 200, 700)],
        [centred("Stone", 58, 690), centred("Tel.: 85-181 | Room H 510", 200, 690)],
      ]),
    ]),
  ).toBeNull();
});

it("does not take a line with digits for a header", () => {
  expect(
    pdfSheets([
      page([line(700, ["Tel. 85-198", "Tel. 85-199"]), line(680, ["Avery Abbott", "Blair Bell"])]),
    ]),
  ).toBeNull();
});
