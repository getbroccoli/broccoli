import { expect, it } from "vitest";

import { termsChangeSentence } from "./termsHistoryText";

it("describes a changed working week with its calendar and start date", () => {
  expect(termsChangeSentence({ field: "workingWeek", oldValue: null, newValue: JSON.stringify(week) })).toBe(
    "changed the working week to Mon–Thu, 8 hours, Scotland bank holidays, from 1 Dec 2026",
  );
});

it("describes a cancelled working week using the cancelled start date", () => {
  expect(termsChangeSentence({ field: "workingWeek", oldValue: JSON.stringify(week), newValue: null })).toBe(
    "cancelled the change to the working week from 1 Dec 2026",
  );
});

it("describes changed allowance rules with the type's name and start date", () => {
  expect(termsChangeSentence({
    field: "timeOff.annual", newLabel: "Annual leave",
    oldValue: JSON.stringify({ ...rules, startDate: null, entitlementDays: 20 }),
    newValue: JSON.stringify(rules),
  })).toBe("changed Annual leave to 22 days a year, bank holidays on top, from 1 Jan 2027");
});

it("describes an offer of recorded leave without an allowance", () => {
  expect(termsChangeSentence({
    field: "timeOff.family", newLabel: "Family leave", oldValue: null,
    newValue: JSON.stringify({ startDate: "2026-01-01", balance: "no_balance", entitlementDays: null, bankHolidays: null }),
  })).toBe("offered Family leave from 1 Jan 2026: Recorded, doesn't count");
});

it("describes cancelled rules with the type's name and cancelled start date", () => {
  expect(termsChangeSentence({ field: "timeOff.annual", newLabel: "Annual leave", oldValue: JSON.stringify(rules), newValue: null })).toBe(
    "cancelled the change to Annual leave from 1 Jan 2027",
  );
});

it("leaves other fields to the generic history wording", () => {
  expect(termsChangeSentence({ field: "name", oldValue: "Old terms", newValue: "New terms" })).toBeNull();
});

const week = {
  startDate: "2026-12-01", minutes: [480, 480, 480, 480, 0, 0, 0],
  fullDayMinutes: 480, bankHolidayCalendar: "scotland",
};

const rules = {
  startDate: "2027-01-01", balance: "balance_from_allowance",
  entitlementDays: 22, bankHolidays: "bank_holidays_on_top_of_allowance",
};
