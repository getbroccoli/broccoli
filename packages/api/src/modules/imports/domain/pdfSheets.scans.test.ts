import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { hasScannedPage } from ".";

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

it("refuses a header-less continuation whose rows moved over a full-page image", () => {
  const table = page([line(760, ["Name", "Email"]), line(740, ["Avery", "a@example.com"])]);
  const continuation = page(
    [
      line(740, ["Robin Reed", "robin@example.com"], 20, 20),
      line(720, ["Morgan Lake", "morgan@example.com"], 20, 20),
    ],
    1,
  );
  expect(hasScannedPage([table, continuation])).toBe(true);
});
