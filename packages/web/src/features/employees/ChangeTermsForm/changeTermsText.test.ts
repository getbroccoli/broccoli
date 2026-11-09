import { expect, it } from "vitest";

import { savedToast, saveLine, skipError } from "./changeTermsText";

it("says when a future move will apply", () => {
  const line = saveLine({
    firstName: "Sam",
    termsName: "Scotland",
    startDate: "2026-12-01",
    today: "2026-11-09",
    keepsOwn: [],
  });

  expect(line).toBe("Saving moves Sam to Scotland from 1 Dec 2026.");
});

it.each([
  { startDate: "2026-11-09", date: "9 Nov 2026" },
  { startDate: "2026-03-01", date: "1 Mar 2026" },
])("says a move from $startDate recalculates the allowance", ({ startDate, date }) => {
  const line = saveLine({
    firstName: "Sam",
    termsName: "Scotland",
    startDate,
    today: "2026-11-09",
    keepsOwn: [],
  });

  expect(line).toBe(
    `Saving moves Sam to Scotland from ${date}. Sam’s allowance is worked out again from that date.`,
  );
});

it.each([
  { keepsOwn: ["working week"], kept: "working week" },
  { keepsOwn: ["working week", "Annual leave"], kept: "working week and Annual leave" },
  {
    keepsOwn: ["working week", "Annual leave", "Sickness"],
    kept: "working week, Annual leave and Sickness",
  },
])("names the person's own $kept that stay", ({ keepsOwn, kept }) => {
  const line = saveLine({
    firstName: "Sam",
    termsName: "Scotland",
    startDate: "2026-12-01",
    today: "2026-11-09",
    keepsOwn,
  });

  expect(line).toBe(`Saving moves Sam to Scotland from 1 Dec 2026. Sam keeps their own ${kept}.`);
});

it.each([
  { startDate: "2026-12-01", expected: "Sam moves to Scotland on 1 Dec 2026." },
  { startDate: "2026-11-09", expected: "Sam is on Scotland from 9 Nov 2026." },
  { startDate: "2026-03-01", expected: "Sam is on Scotland from 1 Mar 2026." },
])("confirms a saved move from $startDate", ({ startDate, expected }) => {
  const toast = savedToast({
    firstName: "Sam",
    termsName: "Scotland",
    startDate,
    today: "2026-11-09",
  });

  expect(toast).toBe(expected);
});

it.each([
  { reason: "ALREADY_ON_TERMS", expected: "Sam is already on Scotland on 1 Dec 2026." },
  { reason: "LEFT_BEFORE_DATE", expected: "Sam leaves before 1 Dec 2026. Pick an earlier date." },
] as const)("explains a person skipped for $reason", ({ reason, expected }) => {
  const error = skipError({
    firstName: "Sam",
    termsName: "Scotland",
    startDate: "2026-12-01",
    reason,
  });

  expect(error).toBe(expected);
});
