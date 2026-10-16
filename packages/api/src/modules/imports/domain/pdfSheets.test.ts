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
  { name: "footer", y: 20 },
  { name: "running title", y: 780 },
])("refuses a scan whose $name lines up with the table's columns", ({ y }) => {
  const table = page([
    line(760, ["Name", "Email"]),
    line(740, ["Avery Stone", "avery@example.com"]),
  ]);
  const scanned = page([line(y, ["Staff directory", "Page 2 of 2"])], 1);

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

it("continues without a header and drops one-cell and two-cell running titles", () => {
  const rows = [
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
  ];
  expect(
    pdfSheets([
      page([line(740, rows[0]!), line(720, rows[1]!)]),
      page([
        line(780, ["Employee roster"]),
        [
          ...line(760, ["Cedar Labs · Exported"]),
          { text: "Page 2", x: 500, y: 760, width: 30, height: 10 },
        ],
        line(720, rows[2]!),
      ]),
    ]),
  ).toEqual([{ name: null, rows }]);
});

it.for([
  { name: "one unnamed sheet", staffName: null, costLines: [], costSheets: [] },
  {
    name: "named sheets when other columns follow",
    staffName: "Table 1",
    costLines: [
      line(660, ["Cost summary"]),
      line(640, ["Cost centre", "Headcount"], 30),
      line(620, ["Engineering", "2"], 30),
    ],
    costSheets: [
      {
        name: "Table 2",
        rows: [
          ["Cost centre", "Headcount"],
          ["Engineering", "2"],
        ],
      },
    ],
  },
])(
  "joins shifted tables as $name without their sub-headings",
  ({ staffName, costLines, costSheets }) => {
    const header = ["Name", "Email", "Role"];
    const first = ["Avery Stone", "avery@example.com", "Engineer"];
    const second = ["Robin Reed", "robin@example.com", "Research Lead"];
    const tables = [
      line(780, ["Engineering"]),
      line(760, header),
      line(740, first),
      line(720, ["Research"]),
      line(700, header, -14),
      line(680, second, -14),
      ...costLines,
    ];
    expect(pdfSheets([page(tables)])).toEqual([
      { name: staffName, rows: [header, first, second] },
      ...costSheets,
    ]);
  },
);

it("refuses a header-less continuation over a full-page image", () => {
  const table = page([line(760, ["Name", "Email"]), line(740, ["Avery", "a@example.com"])]);
  const continuation = page(
    [
      line(740, ["Robin Reed", "robin@example.com"]),
      line(720, ["Morgan Lake", "morgan@example.com"]),
    ],
    1,
  );
  expect(hasScannedPage([table, continuation])).toBe(true);
});

it("accepts a different table's header and row over a full-page image", () => {
  const table = page([line(760, ["Name", "Email"]), line(740, ["Avery", "a@example.com"])]);
  const second = page(
    [
      line(760, ["Employee", "Work email", "Role"], 14),
      line(740, ["Robin Reed", "robin@example.com", "Engineer"], 14),
    ],
    1,
  );
  expect(hasScannedPage([table, second])).toBe(false);
});

function page(lines: PdfTextItem[][], imageCoverage = 0): PdfPage {
  return { width: 612, height: 792, items: lines.flat(), imageCoverage };
}

function line(y: number, cells: string[], offset = 0): PdfTextItem[] {
  return cells
    .map((text, index) => ({
      text,
      x: 40 + index * 160 + (index > 0 ? offset : 0),
      y,
      width: text.length * 5,
      height: 10,
    }))
    .filter(({ text }) => text !== "");
}
