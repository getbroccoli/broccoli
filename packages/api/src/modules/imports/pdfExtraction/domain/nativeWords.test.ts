import { expect, it } from "vitest";

import { page } from "#test/support";

import { nativeLayoutPages, visibleNativeWords } from "./nativeWords";

it.each([
  { left: -21, kept: false, percent: 79, action: "drops" },
  { left: -20, kept: true, percent: 80, action: "keeps" },
])("$action a word with $percent percent of its box inside the page", ({ left, kept }) => {
  const word = { text: "Avery", left, top: 82, right: left + 100, bottom: 92 };
  const pdfPage = page([[{ text: "Avery", x: left, y: 700, width: 100, height: 10 }]]);
  const wordPage = { width: 612, height: 792, words: [word] };

  expect(visibleNativeWords([pdfPage], [wordPage])).toEqual([
    { ...wordPage, words: kept ? [word] : [] },
  ]);
});

it("refuses readers that counted different numbers of pages", () => {
  expect(visibleNativeWords([page([])], [])).toBeNull();
});

it("converts a native box to a baseline while preserving the PDF.js page geometry", () => {
  const pdfPage = page([], 0.25);
  const wordPage = {
    width: 612,
    height: 792,
    words: [{ text: "Avery", left: 40, top: 200, right: 90, bottom: 300 }],
  };

  expect(nativeLayoutPages([pdfPage], [wordPage])).toEqual([
    {
      width: 612,
      height: 792,
      imageCoverage: 0.25,
      items: [{ text: "Avery", x: 40, y: 514, width: 50, height: 73 }],
    },
  ]);
});
