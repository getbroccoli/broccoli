import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from "./pdfSheets";

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

it("drops a labelled printed-date footer without adding it to the last person's block", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Abbott"]),
        line(680, ["Email: avery@example.com"]),
        line(660, ["Job title: Engineer"]),
        line(600, ["Name: Blair Bell"]),
        line(580, ["Email: blair@example.com"]),
        line(560, ["Job title: Designer"]),
        line(30, ["Printed on: 16.10.2026"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email", "Job title"],
        ["Avery Abbott", "avery@example.com", "Engineer"],
        ["Blair Bell", "blair@example.com", "Designer"],
      ],
    },
  ]);
});

it("keeps a block's labels that start in the top band above the rest of the block", () => {
  const block = (name: string, email: string, title: string, start: string) =>
    page([
      line(730, [`Name: ${name}`]),
      line(700, [`Email: ${email}`]),
      line(680, [`Job title: ${title}`]),
      line(660, [`Start date: ${start}`]),
    ]);

  expect(
    pdfSheets([
      block("Avery Abbott", "avery@example.com", "Engineer", "01.01.2020"),
      block("Blair Bell", "blair@example.com", "Designer", "02.02.2021"),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email", "Job title", "Start date"],
        ["Avery Abbott", "avery@example.com", "Engineer", "01.01.2020"],
        ["Blair Bell", "blair@example.com", "Designer", "02.02.2021"],
      ],
    },
  ]);
});

/** One person's page: three labelled lines and a last line in the bottom band at their spacing. */
function personPage(name: string, email: string, last: string) {
  return page([
    line(130, [`Name: ${name}`]),
    line(110, [`Email: ${email}`]),
    line(90, ["Job title: Engineer"]),
    line(70, [last]),
  ]);
}

it("keeps a block's last field set in the bottom band at the block's spacing", () => {
  expect(
    pdfSheets([
      personPage("Avery Abbott", "avery@example.com", "Start date: 01.01.2020"),
      personPage("Blair Bell", "blair@example.com", "Start date: 02.02.2021"),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email", "Job title", "Start date"],
        ["Avery Abbott", "avery@example.com", "Engineer", "01.01.2020"],
        ["Blair Bell", "blair@example.com", "Engineer", "02.02.2021"],
      ],
    },
  ]);
});

it("drops a labelled footer with the same value at the block's spacing on every page", () => {
  expect(
    pdfSheets([
      personPage("Avery Abbott", "avery@example.com", "Printed on: 16.10.2026"),
      personPage("Blair Bell", "blair@example.com", "Printed on: 16.10.2026"),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email", "Job title"],
        ["Avery Abbott", "avery@example.com", "Engineer"],
        ["Blair Bell", "blair@example.com", "Engineer"],
      ],
    },
  ]);
});
