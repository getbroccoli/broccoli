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

it.each([";", "\t"])("reads %j columns when every row also contains a comma", (delimiter) => {
  const rows = [
    ["First name", "Last name", "Work email", "Job title, department", "Start date"],
    ["Avery", "Acme", "avery@example.com", "Engineer, Platform", "2024-02-29"],
    ["Blair", "Acme", "blair@example.com", "Designer, Product", "2024-03-01"],
  ];

  expect(parseCsv(Buffer.from(rows.map((row) => row.join(delimiter)).join("\n")))).toEqual(rows);
});

it("keeps comma columns with several semicolons inside another column", () => {
  const rows = [
    [
      "First name",
      "Last name",
      "Email",
      "Job title; team; division; location; grade; code",
      "Start date",
    ],
    [
      "Avery",
      "Acme",
      "avery@example.com",
      "Engineer; Platform; Technology; London; G5; ABC",
      "2024-02-29",
    ],
  ];

  expect(parseCsv(Buffer.from(rows.map((row) => row.join(",")).join("\n")))).toEqual(rows);
});

it("keeps comma precedence when equally regular delimiters have the same outer cell lengths", () => {
  expect(parseCsv(Buffer.from("a,b;c\nx,y;z"))).toEqual([
    ["a", "b;c"],
    ["x", "y;z"],
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

it.each(["\0", "\x1B", "\x7F"])(
  "refuses the control character %j anywhere in the file",
  (control) => {
    expect(parseCsv(Buffer.from(`Name,Email\nAvery,avery@example.com${control}`))).toBeNull();
  },
);

it("refuses a PDF", () => {
  expect(
    parseCsv(
      Buffer.from(
        "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n1 0 obj\n<< /Length 4 >>\nstream\n\x78\x9C\x03\x81\nendstream",
        "latin1",
      ),
    ),
  ).toBeNull();
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

it("trims spaces inside quoted cells", () => {
  expect(parseCsv(Buffer.from('Name,Email\n" Avery Stone "," avery@example.com "'))).toEqual([
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
  ]);
});

it("reads quoted delimiters when spaces surround the quoted cells", () => {
  expect(parseCsv(Buffer.from('Name,Email\n "Stone, Avery", "avery@example.com"'))).toEqual([
    ["Name", "Email"],
    ["Stone, Avery", "avery@example.com"],
  ]);
});

it("drops a row of quoted blanks", () => {
  expect(parseCsv(Buffer.from('Name,Email\n" "," "\nAvery Stone,avery@example.com'))).toEqual([
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
  ]);
});
