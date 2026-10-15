import { expect, it } from "vitest";

import { readSheet } from "./sheet";

it("refuses a file containing a NUL byte", () => {
  expect(readSheet(Buffer.from("Name\0"))).toBe("not_csv");
});

it("refuses an empty file", () => {
  expect(readSheet(new Uint8Array())).toBe("empty");
});

it("refuses more than 10,000 rows", () => {
  expect(
    readSheet(
      Buffer.from(Array.from({ length: 10_001 }, () => "Avery,avery@example.com").join("\n")),
    ),
  ).toBe("too_many_rows");
});

it("refuses more than 100 columns", () => {
  expect(readSheet(Buffer.from(Array.from({ length: 101 }, () => "Name").join(",")))).toBe(
    "too_many_columns",
  );
});
