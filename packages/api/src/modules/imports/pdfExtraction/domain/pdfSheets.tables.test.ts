import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from "./pdfSheets";

it("refuses labels without colons whose value column mixes emails with names and titles", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Avery Abbott"]),
        line(680, ["Email", "avery@example.com"]),
        line(660, ["Job title", "Engineer"]),
        line(600, ["Name", "Blair Bell"]),
        line(580, ["Email", "blair@example.com"]),
        line(560, ["Job title", "Designer"]),
      ]),
    ]),
  ).toBeNull();
});

it("refuses people stacked in two columns whose rows mix emails with names and titles", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Avery Abbott", "Blair Bell"]),
        line(680, ["Engineer", "Designer"]),
        line(660, ["avery@example.com", "blair@example.com"]),
        line(600, ["Casey Cole", "Drew Dale"]),
        line(580, ["Manager", "Analyst"]),
        line(560, ["casey@example.com", "drew@example.com"]),
      ]),
    ]),
  ).toBeNull();
});

it("preserves short missing-email placeholders alongside real email addresses", () => {
  const rows = [
    ["Name", "Email", "Job title"],
    ["Avery Abbott", "avery@example.com", "Engineer"],
    ["Blair Bell", "n/a", "Designer"],
    ["Casey Cole", "k.A.", "Manager"],
    ["Drew Dale", "drew@example.com", "Analyst"],
  ];

  expect(pdfSheets([page(rows.map((row, index) => line(700 - index * 20, row)))])).toEqual([
    { name: null, rows },
  ]);
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

it("drops a two-cell title at the columns above a later page's repeated header", () => {
  const header = line(760, ["Name", "Email"]);
  expect(
    pdfSheets([
      page([header, line(740, ["Avery Stone", "avery@example.com"])]),
      page([
        line(780, ["Acme Corp", "Page 2"]),
        header,
        line(740, ["Robin Reed", "robin@example.com"]),
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

it("drops a sub-heading above a table with the same columns", () => {
  const header = line(760, ["Name", "Email"]);
  expect(
    pdfSheets([
      page([
        line(780, ["Engineering"]),
        header,
        line(740, ["Avery Stone", "avery@example.com"]),
        line(720, ["Research"]),
        line(700, ["Name", "Email"]),
        line(680, ["Robin Reed", "robin@example.com"]),
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

it("keeps the rows above a later department's equal header on a continued page", () => {
  const header = line(760, ["Name", "Email"]);
  const rows = [
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
    ["Morgan Lake", "morgan@example.com"],
  ];
  const second = [
    header,
    line(740, rows[1]!),
    line(720, ["Research"]),
    line(700, ["Name", "Email"]),
  ];
  expect(
    pdfSheets([page([header, line(740, rows[0]!)]), page([...second, line(680, rows[2]!)])]),
  ).toEqual([{ name: null, rows: [["Name", "Email"], ...rows] }]);
});

it("keeps the people above a header repeated mid-page", () => {
  const header = ["Name", "Email"];
  const rows = [
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
    ["Morgan Lake", "morgan@example.com"],
    ["Kim Park", "kim@example.com"],
  ];
  const continued = [line(500, rows[1]!), line(480, rows[2]!), line(400, header)];
  expect(
    pdfSheets([
      page([line(760, header), line(740, rows[0]!)]),
      page([...continued, line(380, rows[3]!)]),
    ]),
  ).toEqual([{ name: null, rows: [header, ...rows] }]);
});
