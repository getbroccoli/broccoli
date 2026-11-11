import { expect, it } from "vitest";

import { rulesBefore, rulesDateError } from "./ownRulesForm";

it.each([
  { reason: "missing", startDate: "" },
  { reason: "before the earliest date", startDate: "2025-12-31" },
])("refuses a rules date that is $reason", ({ startDate }) => {
  expect(
    rulesDateError({
      startDate,
      earliest: "2026-01-01",
      before: "BALANCE_FROM_ALLOWANCE",
      balance: "BALANCE_FROM_ALLOWANCE",
    }),
  ).toBe("Pick a date from 1 Jan 2026.");
});

it.each([
  { change: "giving own rules", before: "BALANCE_FROM_ALLOWANCE", balance: "UNLIMITED_BALANCE" },
  {
    change: "returning to the terms",
    before: "UNLIMITED_BALANCE",
    balance: "BALANCE_FROM_ALLOWANCE",
  },
])("refuses changing how a type counts mid-year when $change", ({ before, balance }) => {
  expect(
    rulesDateError({
      startDate: "2026-12-01",
      earliest: "2026-01-01",
      before,
      balance,
    }),
  ).toBe("How it counts changes only from the start of a leave year.");
});

it("allows changing how a type counts at the start of a leave year", () => {
  expect(
    rulesDateError({
      startDate: "2027-01-01",
      earliest: "2026-01-01",
      before: "BALANCE_FROM_ALLOWANCE",
      balance: "UNLIMITED_BALANCE",
    }),
  ).toBeNull();
});

it("allows changing how a type counts on the person's first day", () => {
  expect(
    rulesDateError({
      startDate: "2026-05-04",
      earliest: "2026-05-04",
      before: "BALANCE_FROM_ALLOWANCE",
      balance: "UNLIMITED_BALANCE",
    }),
  ).toBeNull();
});

it("allows keeping the same balance mid-year", () => {
  expect(
    rulesDateError({
      startDate: "2027-07-01",
      earliest: "2026-01-01",
      before: "UNLIMITED_BALANCE",
      balance: "UNLIMITED_BALANCE",
    }),
  ).toBeNull();
});

it.each([
  { change: "offering a type", before: null, balance: "BALANCE_FROM_ALLOWANCE" },
  { change: "stopping an offer", before: "BALANCE_FROM_ALLOWANCE", balance: null },
  { change: "keeping a type unoffered", before: null, balance: null },
])("allows $change mid-year", ({ before, balance }) => {
  expect(
    rulesDateError({
      startDate: "2026-12-01",
      earliest: "2026-01-01",
      before,
      balance,
    }),
  ).toBeNull();
});

it("reads the planned rules that apply the day before a later date", () => {
  const current = {
    startDate: "2026-11-09",
    endDate: "2026-12-31",
    balance: "BALANCE_FROM_ALLOWANCE",
  };
  const planned = { startDate: "2027-01-01", endDate: null, balance: "UNLIMITED_BALANCE" };

  expect(rulesBefore([current, planned], "2027-07-01", "2026-11-09")).toBe(planned);
});

it("reads the previous rules on the exact day a planned change starts", () => {
  const current = {
    startDate: "2026-11-09",
    endDate: "2026-12-31",
    balance: "BALANCE_FROM_ALLOWANCE",
  };
  const planned = { startDate: "2027-01-01", endDate: null, balance: "UNLIMITED_BALANCE" };

  expect(rulesBefore([current, planned], "2027-01-01", "2026-11-09")).toBe(current);
});

it.each([
  { when: "today", date: "2026-11-09" },
  { when: "in the past", date: "2026-03-01" },
])("reads today's rules for a date $when", ({ date }) => {
  const current = { startDate: "2026-11-09", endDate: null, balance: "BALANCE_FROM_ALLOWANCE" };

  expect(rulesBefore([current], date, "2026-11-09")).toBe(current);
});

it("reads no rules when the preceding day is in a gap", () => {
  const versions = [
    { startDate: "2026-11-09", endDate: "2026-12-31" },
    { startDate: "2027-03-01", endDate: null },
  ];

  expect(rulesBefore(versions, "2027-02-01", "2026-11-09")).toBeNull();
});

it("reads no rules when the type has no versions", () => {
  expect(rulesBefore([], "2027-01-01", "2026-11-09")).toBeNull();
});
