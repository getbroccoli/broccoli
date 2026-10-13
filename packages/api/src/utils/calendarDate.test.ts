import { expect, it } from "vitest";

import { addDays, parseCalendarDate } from ".";

it("returns a real date unchanged", () => {
  expect(parseCalendarDate("2026-02-28")).toBe("2026-02-28");
});

it("accepts 29 February in a leap year", () => {
  expect(parseCalendarDate("2024-02-29")).toBe("2024-02-29");
});

it("refuses 29 February in other years", () => {
  expect(parseCalendarDate("2025-02-29")).toBeUndefined();
});

it("refuses a day that does not exist", () => {
  expect(parseCalendarDate("2026-04-31")).toBeUndefined();
});

it("refuses month 13", () => {
  expect(parseCalendarDate("2026-13-01")).toBeUndefined();
});

it("refuses single-digit months and days", () => {
  expect(parseCalendarDate("2026-1-1")).toBeUndefined();
});

it("refuses a date with a time", () => {
  expect(parseCalendarDate("2026-02-28T00:00:00Z")).toBeUndefined();
});

it("adds days across a month end", () => {
  expect(addDays(parseCalendarDate("2026-04-30")!, 1)).toBe("2026-05-01");
});

it("adds days across a year end", () => {
  expect(addDays(parseCalendarDate("2026-12-31")!, 1)).toBe("2027-01-01");
});

it("subtracts a day onto leap day", () => {
  expect(addDays(parseCalendarDate("2028-03-01")!, -1)).toBe("2028-02-29");
});

it("moves backwards for a negative offset", () => {
  expect(addDays(parseCalendarDate("2026-10-13")!, -30)).toBe("2026-09-13");
});
