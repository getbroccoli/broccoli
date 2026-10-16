import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from ".";

it.for([
  { name: "a second line", y: 680, continuation: "Manager" },
  { name: "a line in the bottom band", y: 85, continuation: "Manager" },
  { name: "a line starting with Total", y: 680, continuation: "Total Rewards" },
])("joins a job title wrapped onto $name", ({ y, continuation }) => {
  const header = ["Name", "Job title", "Start"];
  expect(
    pdfSheets([
      page([
        line(700, header),
        line(y, ["Isla McKenna", "Senior Customer Experience", "2020-08-17"]),
        line(y - 15, ["", continuation]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [header, ["Isla McKenna", `Senior Customer Experience ${continuation}`, "2020-08-17"]],
    },
  ]);
});

it("joins a wrapped name in the first column into one person's row", () => {
  const header = ["Name", "Job title", "Start"];
  expect(
    pdfSheets([
      page([
        line(700, header),
        line(680, ["Maria-Theresa von", "Designer", "2020-08-17"]),
        line(672, ["Hohenberg"]),
        line(650, ["Lin Wu", "Analyst", "2024-06-24"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        header,
        ["Maria-Theresa von Hohenberg", "Designer", "2020-08-17"],
        ["Lin Wu", "Analyst", "2024-06-24"],
      ],
    },
  ]);
});

it("keeps a nearby person's row missing only its first value as its own row", () => {
  const header = ["Name", "Job title", "Start"];
  const first = ["Isla McKenna", "Designer", "2020-08-17"];
  const second = ["", "Analyst", "2024-06-24"];
  expect(pdfSheets([page([line(700, header), line(680, first), line(672, second)])])).toEqual([
    { name: null, rows: [header, first, second] },
  ]);
});

it("refuses a one-cell line at a column far below the last row outside the page bands", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Job title", "Start"]),
        line(680, ["Isla McKenna", "Designer", "2020-08-17"]),
        line(600, ["", "Unexplained text"]),
      ]),
    ]),
  ).toBeNull();
});

it("joins a table value over three lines using the distance from each preceding line", () => {
  const header = ["Name", "Job title", "Start"];
  expect(
    pdfSheets([
      page([
        line(700, header),
        line(680, ["Isla McKenna", "Workplace and", "2020-08-17"]),
        line(670, ["", "People Experience"]),
        line(660, ["", "Specialist"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [header, ["Isla McKenna", "Workplace and People Experience Specialist", "2020-08-17"]],
    },
  ]);
});

it.for([
  {
    name: "two cells on the second line",
    continuation: ["", "", "datum", "Nr."],
    header: ["Name", "Tätigkeit", "Eintritts-datum", "Personal-Nr."],
    repeat: false,
  },
  {
    name: "one cell on the second line",
    continuation: ["", "", "datum"],
    header: ["Name", "Tätigkeit", "Eintritts-datum", "Personalnummer"],
    repeat: false,
  },
  {
    name: "the same wrapped header repeated on a later page",
    continuation: ["", "", "datum", "Nr."],
    header: ["Name", "Tätigkeit", "Eintritts-datum", "Personal-Nr."],
    repeat: true,
  },
])(
  "reads a wrapped header with $name without turning it into a row",
  ({ continuation, header, repeat }) => {
    const wrappedHeader = [
      line(700, [
        "Name",
        "Tätigkeit",
        "Eintritts-",
        continuation[3] ? "Personal-" : "Personalnummer",
      ]),
      line(690, continuation),
    ];
    const first = ["Isla McKenna", "Designer", "2020-08-17", "61021"];
    const second = ["Lin Wu", "Analyst", "2024-06-24", "61022"];
    const pages = [page([...wrappedHeader, line(670, first)])];
    if (repeat) {
      pages.push(page([...wrappedHeader, line(670, second)]));
    }

    expect(pdfSheets(pages)).toEqual([
      { name: null, rows: [header, first, ...(repeat ? [second] : [])] },
    ]);
  },
);

it("joins a wrapped name in a row that has only a name", () => {
  const header = ["Name", "Job title", "Start"];
  expect(
    pdfSheets([
      page([
        line(700, header),
        line(680, ["Lin Wu", "Analyst", "2024-06-24"]),
        line(650, ["Maria-Theresa von"]),
        line(640, ["Hohenberg"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [header, ["Lin Wu", "Analyst", "2024-06-24"], ["Maria-Theresa von Hohenberg", "", ""]],
    },
  ]);
});
