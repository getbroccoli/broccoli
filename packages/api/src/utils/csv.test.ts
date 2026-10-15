import { expect, it } from "vitest";

import { parseCsv } from ".";

it.each([",", ";", "\t"])("reads %j separated columns", (delimiter) => {
  const text =
    ["Name", "Email"].join(delimiter) + "\n" + ["Avery Stone", "avery@example.com"].join(delimiter);
  expect(parseCsv(Buffer.from(text))).toEqual([
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
  ]);
});

it("chooses the delimiter with consistent columns despite punctuation in cells", () => {
  expect(
    parseCsv(
      Buffer.from(
        "Name;Role\nAvery Stone;Design, research\nRobin Reed;Engineering\nSam Vale;People, hiring, operations",
      ),
    ),
  ).toEqual([
    ["Name", "Role"],
    ["Avery Stone", "Design, research"],
    ["Robin Reed", "Engineering"],
    ["Sam Vale", "People, hiring, operations"],
  ]);
});

it("keeps delimiters and newlines inside quoted cells", () => {
  expect(parseCsv(Buffer.from('Name,Notes\n"Stone, Avery","First line\nSecond line"'))).toEqual([
    ["Name", "Notes"],
    ["Stone, Avery", "First line\nSecond line"],
  ]);
});

it("strips a UTF-8 BOM and preserves Unicode", () => {
  expect(parseCsv(Buffer.from("\uFEFFName,City\nRenée,Montréal"))).toEqual([
    ["Name", "City"],
    ["Renée", "Montréal"],
  ]);
});

it("reads invalid UTF-8 as windows-1252", () => {
  expect(
    parseCsv(Uint8Array.from([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x52, 0x65, 0x6e, 0xe9, 0x65])),
  ).toEqual([["Name"], ["Renée"]]);
});

it("refuses a NUL byte anywhere in the file", () => {
  expect(parseCsv(Buffer.from("Name,Email\nAvery,avery@example.com\0"))).toBeNull();
});

it("trims cells and drops rows whose cells are all empty", () => {
  expect(parseCsv(Buffer.from(" Name , Email \n , \n Avery , avery@example.com \n\n"))).toEqual([
    ["Name", "Email"],
    ["Avery", "avery@example.com"],
  ]);
});

it("keeps each row's own length", () => {
  expect(
    parseCsv(
      Buffer.from("Name,Email\nAvery,avery@example.com\nRobin\nSam,sam@example.com,Designer"),
    ),
  ).toEqual([
    ["Name", "Email"],
    ["Avery", "avery@example.com"],
    ["Robin"],
    ["Sam", "sam@example.com", "Designer"],
  ]);
});
