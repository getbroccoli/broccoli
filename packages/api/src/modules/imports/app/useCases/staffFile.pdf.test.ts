import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

import { parseCsv } from "../../../../utils";
import { readStaffFile } from "./staffFile";

it.for(["javascript-openaction", "embedded-file", "external-uri"])(
  "reads only the visible table from %s",
  async (name) => {
    const fixtures = new URL("../../../../../test/fixtures/pdf/", import.meta.url);
    const pdf = await readFile(new URL(`${name}.pdf`, fixtures));
    const csv = await readFile(new URL(`${name}.csv`, fixtures));
    const rows = parseCsv(csv);
    expect(rows).not.toBeNull();

    expect(await readStaffFile(pdf)).toEqual([{ name: null, rows }]);
  },
);

it("reads a header-once PDF like its CSV twin without running titles", async () => {
  const fixtures = new URL("../../../../../test/fixtures/pdf/", import.meta.url);
  const pdf = await readFile(new URL("header-once-multpage.pdf", fixtures));
  const csv = await readFile(new URL("header-once-multpage.csv", fixtures));
  const rows = parseCsv(csv);
  expect(rows).not.toBeNull();

  expect(await readStaffFile(pdf)).toEqual([{ name: null, rows }]);
});

it("joins department tables and keeps the cost summary in its own named sheet", async () => {
  const pdf = await readFile(
    new URL("../../../../../test/fixtures/pdf/department-tables.pdf", import.meta.url),
  );

  expect(await readStaffFile(pdf)).toEqual([
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

it.for(["encrypted-owner-only", "logo-table", "one-person-letterhead"])(
  "reads the rows of %s like its CSV twin",
  async (name) => {
    const fixtures = new URL("../../../../../test/fixtures/pdf/", import.meta.url);
    const pdf = await readFile(new URL(`${name}.pdf`, fixtures));
    const csv = await readFile(new URL(`${name}.csv`, fixtures));
    const rows = parseCsv(csv);
    expect(rows).not.toBeNull();

    expect(await readStaffFile(pdf)).toEqual([{ name: null, rows }]);
  },
);
