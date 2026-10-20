import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

import { readPdfPages, samplePdfFile } from "#test/support";

import { parseCsv } from "../../../../utils";
import { pdfSheets } from "./pdfSheets";

vi.setConfig({ testTimeout: 30_000 });

it("keeps a nearby sparse person row separate in a PDF", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/tight-sparse-row.pdf", import.meta.url),
  );

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email", "Job title", "Start date"],
        ["Avery Abbott", "avery@example.com", "Engineer", "01.01.2020"],
        ["Blair Bell", "blair@example.com", "", ""],
      ],
    },
  ]);
});

it("drops a PDF block list's printed-date footer", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/block-printed-footer.pdf", import.meta.url),
  );

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
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

it("reads a table continued without a header over a full-page letterhead", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/continued-letterhead.pdf", import.meta.url),
  );

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Abbott", "avery@example.com"],
        ["Blair Bell", "blair@example.com"],
      ],
    },
  ]);
});

it.for([
  "javascript-openaction",
  "embedded-file",
  "external-uri",
  "header-once-multpage",
  "encrypted-owner-only",
  "logo-table",
  "one-person-letterhead",
  "personio-landscape",
  "name-only-grid",
  "bamboohr-month-first",
])("reads the visible rows of %s like its CSV twin", async (name) => {
  const fixtures = new URL("../../../../../test/fixtures/pdf/", import.meta.url);
  const bytes = await readFile(new URL(`${name}.pdf`, fixtures));
  const rows = parseCsv(await readFile(new URL(`${name}.csv`, fixtures)));
  expect(rows).not.toBeNull();

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([{ name: null, rows }]);
});

it("reads one labelled person per page with family names first", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/datev-personaldaten-blocks.pdf", import.meta.url),
  );

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Personalnummer", "Tätigkeit", "Eintritt"],
        ["Müller, Anna", "61021", "Sachbearbeiterin", "12.03.2021"],
        ["Krause, Benedikt", "61022", "Lagerleiter", "27.08.2022"],
        ["Yilmaz, Cem", "61023", "IT-Administrator", "04.11.2023"],
      ],
    },
  ]);
});

it("keeps every person's identical job title and location in page blocks", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/same-title-page-blocks.pdf", import.meta.url),
  );

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
    {
      name: null,
      rows: [
        ["", "Job title", "Location", "Work email", "Start"],
        [
          "Sanne Bauer",
          "Site Coordinator",
          "Rotterdam Office",
          "sanne.bauer@cobalt.example",
          "05.01.2021",
        ],
        [
          "Luis Marin",
          "Site Coordinator",
          "Rotterdam Office",
          "luis.marin@cobalt.example",
          "18.04.2022",
        ],
        [
          "Eva Kovac",
          "Site Coordinator",
          "Rotterdam Office",
          "eva.kovac@cobalt.example",
          "29.09.2023",
        ],
      ],
    },
  ]);
});

it("joins department tables and keeps the cost summary in its own named sheet", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/department-tables.pdf", import.meta.url),
  );

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
    {
      name: "Table 1",
      rows: [
        ["Employee", "Work email", "Role", "Start date"],
        ["Priya Nair", "priya.nair@harbor.example", "Engineering Manager", "08.01.2021"],
        ["Luka Bennett", "luka.bennett@harbor.example", "Backend Engineer", "15.06.2022"],
        ["Hana Sato", "hana.sato@harbor.example", "Research Lead", "29.09.2023"],
        ["Owen Morris", "owen.morris@harbor.example", "Account Manager", "11.03.2020"],
        ["Amara Diallo", "amara.diallo@harbor.example", "Customer Success Lead", "24.08.2021"],
        ["Felix Keller", "felix.keller@harbor.example", "Finance Analyst", "02.12.2022"],
      ],
    },
    {
      name: "Table 2",
      rows: [
        ["Cost centre", "Headcount", "Annual budget"],
        ["Engineering", "2", "€184,000"],
        ["Research", "1", "€72,000"],
        ["Commercial", "2", "€151,000"],
        ["Finance", "1", "€61,000"],
      ],
    },
  ]);
});

it("reads all nine people without running titles, footers or totals", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/datev-repeated-header.pdf", import.meta.url),
  );

  const sheets = pdfSheets(await readPdfPages(bytes));

  expect(sheets).toHaveLength(1);
  expect(sheets![0]!.rows).toHaveLength(10);
  expect(sheets![0]!.rows.slice(1).map((row) => row[0])).toEqual([
    "47101",
    "47102",
    "47103",
    "47104",
    "47105",
    "47106",
    "47107",
    "47108",
    "47109",
  ]);
  expect(sheets![0]!.rows.flat().join(" ")).not.toMatch(/Seite|Summe|Anzahl/);
});

it("reads the four people from a letterhead report without its totals", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/letterhead-totals.pdf", import.meta.url),
  );

  const sheets = pdfSheets(await readPdfPages(bytes));

  expect(sheets).not.toBeNull();
  const staff = sheets!.find(({ rows }) => rows[0]?.includes("Work email"));
  expect(staff!.rows).toHaveLength(5);
  expect(staff!.rows.slice(1).map((row) => row[1])).toEqual([
    "Elena Varga",
    "Samuel Green",
    "Yara Moussa",
    "Theo Lind",
  ]);
  expect(sheets!.flatMap(({ rows }) => rows.flat()).join(" ")).not.toMatch(/Subtotal|Totals/);
});

it("joins two PDF pages without repeating their shared header", async () => {
  const bytes = samplePdfFile({
    pages: ["Avery Stone", "Robin Reed"].map((name, index) => ({
      texts: [
        { text: "Name", x: 40, y: 760 },
        { text: "Email", x: 200, y: 760 },
        { text: name, x: 40, y: 740 },
        { text: index === 0 ? "avery@example.com" : "robin@example.com", x: 200, y: 740 },
      ],
    })),
  });

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
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
  { name: "a small logo", image: { x: 40, y: 780, width: 50, height: 10 } },
  { name: "a full-page letterhead", image: { x: 0, y: 0, width: 612, height: 792 } },
])("reads a one-person table over $name", async ({ image }) => {
  const bytes = samplePdfFile({
    pages: [
      {
        texts: [
          { text: "Name", x: 40, y: 760 },
          { text: "Email", x: 200, y: 760 },
          { text: "Avery Stone", x: 40, y: 740 },
          { text: "avery@example.com", x: 200, y: 740 },
        ],
        images: [image],
      },
    ],
  });

  expect(pdfSheets(await readPdfPages(bytes))).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Email"],
        ["Avery Stone", "avery@example.com"],
      ],
    },
  ]);
});
