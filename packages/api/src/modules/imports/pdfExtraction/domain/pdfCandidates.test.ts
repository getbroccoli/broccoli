import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfCandidates, type PdfCandidate } from "./pdfCandidates";

it("splits dot leaders into local name and telephone columns", () => {
  const candidates = pdfCandidates([
    page([line(700, ["Avery Stone ........ 555-0101"]), line(680, ["Robin Reed .... 555-0102"])]),
  ]);

  expect(leaders(candidates)).toMatchObject([
    {
      name: null,
      rows: [
        ["Name", "Phone", "Job title"],
        ["Avery Stone", "555-0101", ""],
        ["Robin Reed", "555-0102", ""],
      ],
    },
  ]);
  expect(leaders(candidates)?.[0]?.knownMapping).toMatchObject({
    fullName: 0,
    jobTitle: 2,
  });
});

it("ignores contact labels and keeps the title beneath a directory entry", () => {
  const candidates = pdfCandidates([
    page([
      line(740, ["Toll Free: .... 555-0000"]),
      line(720, ["FAX (Office) .... 555-0001"]),
      line(680, ["Stone, Avery .... 555-0101"]),
      line(668, ["Office Manager"]),
    ]),
  ]);
  expect(leaders(candidates)?.[0]?.rows).toEqual([
    ["Name", "Phone", "Job title"],
    ["Stone, Avery", "555-0101", "Office Manager"],
  ]);
});

it("does not mistake a dot-separated location and job title for a directory person", () => {
  expect(pdfCandidates([page([line(700, ["Harbor, CA .... Office Manager"])])])).toEqual([]);
});

it("does not attach the next person's name as a dot-leader entry's job title", () => {
  const candidates = pdfCandidates([
    page([
      line(700, ["Avery Stone .... 555-0101"]),
      line(688, ["Robin Reed"]),
      line(676, ["555-0102"], 0, 250),
    ]),
  ]);
  expect(leaders(candidates)?.[0]?.rows[1]).toEqual(["Avery Stone", "555-0101", ""]);
});

function leaders(candidates: PdfCandidate[]) {
  return candidates.find(({ id }) => id === "leaders")?.sheets;
}
