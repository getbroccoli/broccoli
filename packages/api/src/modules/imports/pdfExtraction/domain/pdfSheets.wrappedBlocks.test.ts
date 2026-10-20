import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from "./pdfSheets";

it.for([
  {
    name: "two lines",
    continuation: [line(665, ["Logistik"], 0, 55)],
    value: "Leiterin Einkauf und Logistik",
  },
  {
    name: "three lines",
    continuation: [line(665, ["Logistik und"], 0, 55), line(650, ["Transport"], 0, 55)],
    value: "Leiterin Einkauf und Logistik und Transport",
  },
])("joins an indented block value wrapped over $name", ({ continuation, value }) => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Tätigkeit: Leiterin Einkauf und"]),
        ...continuation,
        line(600, ["Name: Robin Reed"]),
        line(580, ["Tätigkeit: Designer"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Tätigkeit"],
        ["Avery Stone", value],
        ["Robin Reed", "Designer"],
      ],
    },
  ]);
});

it("refuses an unlabelled line at the label column directly below a block value", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Tätigkeit: Leiterin Einkauf und"]),
        line(665, ["Logistik"]),
        line(645, ["Eintritt: 2020-08-17"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Tätigkeit: Designer"]),
      ]),
    ]),
  ).toBeNull();
});

it("joins a wrapped block value under a report title without reading it as a name", () => {
  expect(
    pdfSheets([
      page([
        line(760, ["Staff report"]),
        line(700, ["Name: Avery Stone"]),
        line(680, ["Tätigkeit: Leiterin Einkauf und"]),
        line(665, ["Logistik"], 0, 55),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Tätigkeit: Designer"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Tätigkeit"],
        ["Avery Stone", "Leiterin Einkauf und Logistik"],
        ["Robin Reed", "Designer"],
      ],
    },
  ]);
});
