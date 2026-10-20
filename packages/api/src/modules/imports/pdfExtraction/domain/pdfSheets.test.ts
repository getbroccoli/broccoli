import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from "./pdfSheets";

it("keeps every row in page order with the repeated header only once", () => {
  const header = line(760, ["Name", "Email"]);

  expect(
    pdfSheets([
      page([header, line(740, ["Avery Stone", "avery@example.com"])]),
      page([header, line(740, ["Robin Reed", "robin@example.com"])]),
      page([header, line(740, ["Morgan Lake", "morgan@example.com"])]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
        ["Robin Reed", "robin@example.com"],
        ["Morgan Lake", "morgan@example.com"],
      ],
    },
  ]);
});

it("drops the title and period above the first header", () => {
  expect(
    pdfSheets([
      page([
        line(780, ["Acme Corp"]),
        line(760, ["Payroll October 2026"]),
        line(740, ["Name", "Email"]),
        line(720, ["Avery Stone", "avery@example.com"]),
        line(700, ["Robin Reed", "robin@example.com"]),
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

it("does not mistake a two-cell running title for the table header", () => {
  const title = [
    ...line(780, ["Acme Corp"]),
    { text: "Seite 1 von 3", x: 500, y: 780, width: 60, height: 10 },
  ];

  expect(
    pdfSheets([
      page([
        title,
        line(760, ["Name", "Email"]),
        line(740, ["Avery Stone", "avery@example.com"]),
        line(720, ["Robin Reed", "robin@example.com"]),
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

it("drops running titles above a later page's repeated header", () => {
  const header = line(740, ["Name", "Email"]);

  expect(
    pdfSheets([
      page([
        header,
        line(720, ["Avery Stone", "avery@example.com"]),
        line(700, ["Robin Reed", "robin@example.com"]),
      ]),
      page([
        line(780, ["Acme Corp"]),
        line(760, ["Payroll October 2026"]),
        header,
        line(720, ["Morgan Lake", "morgan@example.com"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
        ["Robin Reed", "robin@example.com"],
        ["Morgan Lake", "morgan@example.com"],
      ],
    },
  ]);
});

it("joins nearby text items in one column with a space", () => {
  expect(
    pdfSheets([
      page([
        line(760, ["Name", "Role"]),
        [
          ...line(740, ["Avery Stone", "Payroll"]),
          { text: "Specialist", x: 240, y: 740, width: 50, height: 10 },
        ],
        line(720, ["Robin Reed", "Designer"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Role"],
        ["Avery Stone", "Payroll Specialist"],
        ["Robin Reed", "Designer"],
      ],
    },
  ]);
});

it("preserves an empty column in a row", () => {
  expect(
    pdfSheets([
      page([
        line(760, ["Name", "Email", "Role"]),
        line(740, ["Avery Stone", "", "Designer"]),
        line(720, ["Robin Reed", "robin@example.com", "Engineer"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email", "Role"],
        ["Avery Stone", "", "Designer"],
        ["Robin Reed", "robin@example.com", "Engineer"],
      ],
    },
  ]);
});

it("returns null when no page has a line with two cells", () => {
  expect(
    pdfSheets([
      page([line(760, ["Staff directory"]), line(740, ["Avery Stone"])]),
      page([line(760, ["Robin Reed"])]),
    ]),
  ).toBeNull();
});

it("finds a header followed by just one staff row", () => {
  expect(
    pdfSheets([
      page([line(760, ["Name", "Email"]), line(740, ["Avery Stone", "avery@example.com"])]),
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
