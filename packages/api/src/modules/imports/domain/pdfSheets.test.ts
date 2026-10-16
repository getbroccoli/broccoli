import { expect, it } from "vitest";

import type { PdfPage, PdfTextItem } from "../../../utils";
import { hasScannedPage, pdfSheets } from ".";

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

it.for([
  { name: "an image-only page", scanned: page([], 1) },
  { name: "a scan with a visible page number", scanned: page([line(20, ["Page 2 of 2"])], 1) },
  { name: "a scan covering 40% of a page", scanned: page([], 0.4) },
  { name: "a tiled scan", scanned: page([], 1) },
  { name: "an OCR scan without visible text", scanned: page([], 1) },
])("detects $name alone or after a valid table", ({ scanned }) => {
  const table = page([
    line(760, ["Name", "Email"]),
    line(740, ["Avery Stone", "avery@example.com"]),
  ]);

  expect(hasScannedPage([scanned])).toBe(true);
  expect(hasScannedPage([table, scanned])).toBe(true);
});

it.for([
  { name: "a small logo", coverage: 0.02 },
  { name: "a full-page letterhead image", coverage: 1 },
  { name: "no images", coverage: 0 },
])("accepts a one-person table with $name", ({ coverage }) => {
  const table = page(
    [line(760, ["Name", "Email"]), line(740, ["Avery Stone", "avery@example.com"])],
    coverage,
  );

  expect(hasScannedPage([table])).toBe(false);
});

function page(lines: PdfTextItem[][], imageCoverage = 0): PdfPage {
  return { width: 612, height: 792, items: lines.flat(), imageCoverage };
}

function line(y: number, cells: string[]): PdfTextItem[] {
  return cells
    .map((text, index) => ({ text, x: 40 + index * 160, y, width: text.length * 5, height: 10 }))
    .filter(({ text }) => text !== "");
}
