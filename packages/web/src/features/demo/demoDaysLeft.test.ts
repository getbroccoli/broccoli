import { expect, it } from "vitest";

import { demoDaysLeft } from "./demoDaysLeft";

it("shows seven days when exactly seven days remain", () => {
  const days = demoDaysLeft("2026-10-26T12:00:00Z", new Date("2026-10-19T12:00:00Z"));

  expect(days).toBe(7);
});

it("rounds six days and one hour up to seven days", () => {
  const days = demoDaysLeft("2026-10-25T13:00:00Z", new Date("2026-10-19T12:00:00Z"));

  expect(days).toBe(7);
});

it("shows one day when one hour remains", () => {
  const days = demoDaysLeft("2026-10-19T13:00:00Z", new Date("2026-10-19T12:00:00Z"));

  expect(days).toBe(1);
});

it("shows zero days at the deadline", () => {
  const days = demoDaysLeft("2026-10-19T12:00:00Z", new Date("2026-10-19T12:00:00Z"));

  expect(days).toBe(0);
});

it("shows zero days after the deadline", () => {
  const days = demoDaysLeft("2026-10-18T12:00:00Z", new Date("2026-10-19T12:00:00Z"));

  expect(days).toBe(0);
});
