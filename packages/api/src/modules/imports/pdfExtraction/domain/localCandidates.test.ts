import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { checkSheets } from "../../domain";
import { localCandidates, prunedCandidates, rankedCandidates } from "./localCandidates";
import type { PdfCandidate } from "./pdfCandidates";
import { pdfSheets } from "./pdfSheets";

it("keeps one candidate when both text representations produce the same sheets", () => {
  const pages = [
    page([
      line(700, ["Name", "Email"]),
      line(680, ["Avery Stone", "avery@example.com"]),
      line(660, ["Robin Reed", "robin@example.com"]),
    ]),
  ];

  expect(localCandidates([pages, structuredClone(pages)])).toEqual([
    { id: expect.any(String) as unknown, sheets: pdfSheets(pages) },
  ]);
});

it("leaves out a table with eleven sheets", () => {
  const pages = Array.from({ length: 11 }, (_, index) =>
    page([
      line(740, [`Team ${index}`]),
      line(700, ["Name", `Detail ${String.fromCharCode(65 + index)}`], 0, index * 20),
      line(680, ["Avery Stone", "Office"], 0, index * 20),
    ]),
  );
  const sheets = pdfSheets(pages)!;
  expect(checkSheets(sheets)).toBe("too_many_sheets");

  const candidates = localCandidates([pages]);

  expect(candidates.map((candidate) => candidate.sheets)).not.toContainEqual(sheets);
  for (const candidate of candidates)
    expect(checkSheets(candidate.sheets)).toEqual(candidate.sheets);
});

it("leaves out a table with more than ten thousand rows", () => {
  const pages = [
    {
      ...page([
        line(200_040, ["Name", "Email"]),
        ...Array.from({ length: 10_000 }, (_, index) =>
          line(200_020 - index * 20, ["Avery Stone", "avery@example.com"]),
        ),
      ]),
      height: 200_100,
    },
  ];
  const sheets = pdfSheets(pages)!;
  expect(checkSheets(sheets)).toBe("too_many_rows");

  const candidates = localCandidates([pages]);

  expect(candidates.map((candidate) => candidate.sheets)).not.toContainEqual(sheets);
  for (const candidate of candidates)
    expect(checkSheets(candidate.sheets)).toEqual(candidate.sheets);
});

it("leaves out a table with more than one hundred columns", () => {
  const headers = [
    "Name",
    ...Array.from(
      { length: 100 },
      (_, index) => `Detail ${String.fromCharCode(65 + Math.floor(index / 26), 65 + (index % 26))}`,
    ),
  ];
  const values = ["Avery Stone", ...Array.from({ length: 100 }, () => "Office")];
  const pages = [{ ...page([line(700, headers), line(680, values)]), width: 16_300 }];
  const sheets = pdfSheets(pages)!;
  expect(checkSheets(sheets)).toBe("too_many_columns");

  const candidates = localCandidates([pages]);

  expect(candidates.map((candidate) => candidate.sheets)).not.toContainEqual(sheets);
  for (const candidate of candidates)
    expect(checkSheets(candidate.sheets)).toEqual(candidate.sheets);
});

it("prunes a layout when another preserves its people and adds their emails", () => {
  const names = candidate("names", [["Name"], ["Avery Stone"], ["Robin Reed"]]);
  const emails = candidate("emails", [
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
  ]);

  expect(prunedCandidates([names, emails])).toEqual([emails]);
});

it("keeps layouts that disagree about a person's name", () => {
  const avery = candidate("avery", [["Name"], ["Avery Stone"]]);
  const robin = candidate("robin", [
    ["Name", "Email"],
    ["Robin Reed", "robin@example.com"],
  ]);

  expect(prunedCandidates([avery, robin])).toEqual([avery, robin]);
});

it("keeps a smaller layout when a larger one drops one of its people", () => {
  const original = candidate("original", [["Name"], ["Avery Stone"], ["Robin Reed"]]);
  const larger = candidate("larger", [
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
    ["Morgan Lake", "morgan@example.com"],
    ["Taylor Brook", "taylor@example.com"],
  ]);

  expect(prunedCandidates([original, larger])).toEqual([original, larger]);
});

it("keeps conflicting populated fields even when another layout adds emails", () => {
  const engineer = candidate("engineer", [
    ["Name", "Role"],
    ["Avery Stone", "Engineer"],
  ]);
  const designer = candidate("designer", [
    ["Name", "Role", "Email"],
    ["Avery Stone", "Designer", "avery@example.com"],
  ]);

  expect(prunedCandidates([engineer, designer])).toEqual([engineer, designer]);
});

it("does not let one occurrence replace two occurrences of the same person", () => {
  const repeated = candidate("repeated", [["Name"], ["Avery Stone"], ["Avery Stone"]]);
  const different = candidate("different", [
    ["Name", "Email"],
    ["Avery Stone", "avery@example.com"],
    ["Robin Reed", "robin@example.com"],
  ]);

  expect(prunedCandidates([repeated, different])).toEqual([repeated, different]);
});

it("ranks populated email and date fields ahead of names alone", () => {
  const names = candidate("names", [["Name"], ["Avery Stone"], ["Robin Reed"]]);
  const complete = candidate("complete", [
    ["Name", "Email", "Hire date"],
    ["Avery Stone", "avery@example.com", "2021-02-03"],
  ]);

  expect(rankedCandidates([names, complete])).toEqual([complete, names]);
});

it("ranks by attributes per person before total attributes", () => {
  const sparse = candidate("sparse", [
    ["Name", "Email", "Role", "Hire date"],
    ["Avery Stone", "avery@example.com", "Engineer", "2021-02-03"],
    ["Robin Reed", "", "", ""],
    ["Morgan Lake", "", "", ""],
  ]);
  const dense = candidate("dense", [
    ["Name", "Email", "Role"],
    ["Avery Stone", "avery@example.com", "Engineer"],
  ]);

  expect(rankedCandidates([sparse, dense])).toEqual([dense, sparse]);
});

it("counts repeated occurrences separately when ranking equal field coverage", () => {
  const single = candidate("single", [["Name"], ["Avery Stone"]]);
  const repeated = candidate("repeated", [["Name"], ["Avery Stone"], ["Avery Stone"]]);

  expect(rankedCandidates([single, repeated])).toEqual([repeated, single]);
});

it("keeps equally ranked layouts in their original order", () => {
  const first = candidate("first", [["Name"], ["Avery Stone"]]);
  const second = candidate("second", [["Name"], ["Robin Reed"]]);

  expect(rankedCandidates([first, second])).toEqual([first, second]);
});

function candidate(id: string, rows: string[][]): PdfCandidate {
  return { id, sheets: [{ name: null, rows }] };
}
