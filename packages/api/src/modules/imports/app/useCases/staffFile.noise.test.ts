import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";

import { readStaffFile } from "./staffFile";

// The real PDF reader takes seconds per read while the whole suite runs at once.
vi.setConfig({ testTimeout: 30_000 });

it("reads all nine people without the running titles, footers or totals", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/datev-repeated-header.pdf", import.meta.url),
  );

  const sheets = await readStaffFile(bytes);

  expect(sheets).toHaveLength(1);
  if (typeof sheets === "string") throw new Error("The staff table must be readable");
  expect(sheets[0]!.rows).toHaveLength(10);
  expect(sheets[0]!.rows.slice(1).map((row) => row[0])).toEqual([
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
  expect(sheets[0]!.rows.flat().join(" ")).not.toMatch(/Seite|Summe|Anzahl/);
});

it("reads the four people from a letterhead report without its totals", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/letterhead-totals.pdf", import.meta.url),
  );

  const sheets = await readStaffFile(bytes);

  if (typeof sheets === "string") throw new Error("The staff table must be readable");
  const staff = sheets.find(({ rows }) => rows[0]?.includes("Work email"));
  expect(staff).toBeDefined();
  expect(staff!.rows).toHaveLength(5);
  expect(staff!.rows.slice(1).map((row) => row[1])).toEqual([
    "Elena Varga",
    "Samuel Green",
    "Yara Moussa",
    "Theo Lind",
  ]);
  expect(sheets.flatMap(({ rows }) => rows.flat()).join(" ")).not.toMatch(/Subtotal|Totals/);
});

it("refuses the whole PDF when staff prose follows a readable table", async () => {
  const bytes = await readFile(
    new URL("../../../../../test/fixtures/pdf/table-plus-prose-refusal.pdf", import.meta.url),
  );

  expect(await readStaffFile(bytes)).toBe("no_table");
});
