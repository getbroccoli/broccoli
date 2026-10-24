process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { tenureOf } from "./tenure";

it("returns null without a start date", () => {
  expect(tenureOf(null, "2026-10-23")).toBeNull();
});

it("says Starts today on the start date", () => {
  expect(tenureOf("2026-10-23", "2026-10-23")).toBe("Starts today");
});

it("uses singular day when starting tomorrow", () => {
  expect(tenureOf("2026-10-24", "2026-10-23")).toBe("Starts in 1 day");
});

it("counts future calendar days across a daylight saving change", () => {
  expect(tenureOf("2026-11-03", "2026-10-31")).toBe("Starts in 3 days");
});

it("says Less than a month before the first whole month", () => {
  expect(tenureOf("2026-09-24", "2026-10-23")).toBe("Less than a month");
});

it("shows whole months before the first year", () => {
  expect(tenureOf("2026-07-23", "2026-10-23")).toBe("3 mo");
});

it("does not count an unfinished calendar month", () => {
  expect(tenureOf("2026-01-06", "2026-10-05")).toBe("8 mo");
});

it("counts a calendar month on the matching day", () => {
  expect(tenureOf("2026-01-06", "2026-10-06")).toBe("9 mo");
});

it("omits zero months on a full year", () => {
  expect(tenureOf("2025-10-23", "2026-10-23")).toBe("1 yr");
});

it("shows a single year with its remaining months", () => {
  expect(tenureOf("2025-01-06", "2026-10-06")).toBe("1 yr 9 mo");
});

it("pluralises years with remaining months", () => {
  expect(tenureOf("2024-09-23", "2026-10-23")).toBe("2 yrs 1 mo");
});
