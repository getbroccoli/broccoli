import { expect, it } from "vitest";

import { readDateColumn, readSheet } from "./sheet";

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

it("reads ISO dates without inferring an order", () => {
  expect(readDateColumn(["2026-01-02", "2024-02-29"])).toEqual(["2026-01-02", "2024-02-29"]);
});

it.each(["/", ".", "-"])("reads the whole column as day-first with %s separators", (separator) => {
  expect(
    readDateColumn([`02${separator}03${separator}2026`, `14${separator}01${separator}2026`]),
  ).toEqual(["2026-03-02", "2026-01-14"]);
});

it.each(["/", ".", "-"])(
  "reads the whole column as month-first with %s separators",
  (separator) => {
    expect(
      readDateColumn([`02${separator}03${separator}2026`, `01${separator}14${separator}2026`]),
    ).toEqual(["2026-02-03", "2026-01-14"]);
  },
);

it("leaves an ambiguous column empty", () => {
  expect(readDateColumn(["02/03/2026", "04/05/2026"])).toEqual([null, null]);
});

it("ignores impossible dates when inferring the column's date order", () => {
  expect(readDateColumn(["14/01/2026", "02/99/2026"])).toEqual(["2026-01-14", null]);
});

it("leaves a cell that is not a date empty", () => {
  expect(readDateColumn(["14/01/2026", "not a date", "31/02/2026", ""])).toEqual([
    "2026-01-14",
    null,
    null,
    null,
  ]);
});
