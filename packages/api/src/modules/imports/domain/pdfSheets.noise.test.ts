import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from ".";

it("drops page-number footers aligned with a table column", () => {
  const header = line(700, ["Name", "Email"]);

  expect(
    pdfSheets([
      page([
        header,
        line(680, ["Avery Stone", "avery@example.com"]),
        line(30, ["", "Seite 1 von 2"]),
      ]),
      page([
        header,
        line(680, ["Robin Reed", "robin@example.com"]),
        line(30, ["", "Seite 2 von 2"]),
      ]),
    ]),
  ).toEqual([
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

it("drops a one-cell footer even when there is only one page", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(30, ["Printed on 16.10.2026"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
      ],
    },
  ]);
});

it("drops a two-cell footer off the table's columns", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(30, ["Printed on", "16.10.2026"], 0, 80),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
      ],
    },
  ]);
});

it("keeps a two-cell staff row in the bottom page band", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(30, ["Robin Reed", "robin@example.com"]),
      ]),
    ]),
  ).toEqual([
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

it.for([
  ["Summe", "9"],
  ["Anzahl Mitarbeiter: 9", "9"],
  ["9", "45.000"],
])("drops the total line %j and keeps the staff row", (total) => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(660, total),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
      ],
    },
  ]);
});

it("drops a total line whose first worded cell follows a number", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["No.", "Name", "Email"]),
        line(680, ["1", "Avery Stone", "avery@example.com"]),
        line(660, ["5", "Total employees"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["No.", "Name", "Email"],
        ["1", "Avery Stone", "avery@example.com"],
      ],
    },
  ]);
});

it("refuses a table followed by prose spanning empty columns", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email", "Role"]),
        line(680, ["Avery Stone", "avery@example.com", "Designer"]),
        line(660, ["The export also names Robin Reed and Morgan Lake as additional staff."]),
      ]),
    ]),
  ).toBeNull();
});

it("refuses a table followed by a line starting outside its columns", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(660, ["Robin Reed"], 0, 80),
      ]),
    ]),
  ).toBeNull();
});

it("refuses a different-columns table without a heading after the staff table", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(640, ["Name", "Role"], 80),
        line(620, ["Robin Reed", "Engineer"], 80),
      ]),
    ]),
  ).toBeNull();
});
