import { expect, it } from "vitest";

import { clashes, costOfDay } from ".";

it.each([
  ["full_day", 1],
  ["morning", 0.5],
  ["afternoon", 0.5],
] as const)("costs a working %s as %s days", (dayPart, cost) => {
  expect(costOfDay({ dayPart, minutes: 450, isBankHoliday: false })).toBe(cost);
});

it("costs a bank holiday as zero days", () => {
  expect(costOfDay({ dayPart: "full_day", minutes: 450, isBankHoliday: true })).toBe(0);
});

it("costs a day with no working minutes as zero days", () => {
  expect(costOfDay({ dayPart: "morning", minutes: 0, isBankHoliday: false })).toBe(0);
});

it.each([
  ["morning", "afternoon", false],
  ["afternoon", "morning", false],
  ["full_day", "full_day", true],
  ["full_day", "morning", true],
  ["full_day", "afternoon", true],
  ["morning", "full_day", true],
  ["afternoon", "full_day", true],
  ["morning", "morning", true],
  ["afternoon", "afternoon", true],
] as const)("checks whether %s and %s clash: %s", (first, second, expected) => {
  expect(clashes(first, second)).toBe(expected);
});
