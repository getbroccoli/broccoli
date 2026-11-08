import { expect, it } from "vitest";

import {
  appliesFromHint,
  canChangeCounts,
  rulesChangeBox,
  rulesErrors,
  rulesDraftOf,
  rulesSaveLine,
  savedToast,
  weekChangeBox,
  weekErrors,
  weekHint,
  weekSaveLine,
  type RulesDraft,
  type WeekDraft,
} from "./termsDraft";
import type { PolicyVersionText } from "./termsText";

it("summarises a days-only change and the bank holidays that stay on top", () => {
  expect(rulesChangeBox("Annual leave", rules, currentRules, "2027-01-01")).toEqual({
    title: "Annual leave: 20 → 22 days",
    detail: "From 1 Jan 2027, bank holidays still on top",
  });
});

it("summarises an offer of recorded leave", () => {
  const offer: RulesDraft = { ...rules, offer: true, balance: "NO_BALANCE", days: "" };

  expect(rulesChangeBox("Family leave", offer, null, "2026-01-01")).toEqual({
    title: "Family leave: offered, Recorded, doesn't count",
    detail: "From 1 Jan 2026.",
  });
});

it("summarises a change to unlimited leave", () => {
  expect(
    rulesChangeBox(
      "Annual leave",
      { ...rules, balance: "UNLIMITED_BALANCE" },
      currentRules,
      "2027-01-01",
    ),
  ).toEqual({
    title: "Annual leave: Unlimited",
    detail: "From 1 Jan 2027.",
  });
});

it("summarises a new working week and when it starts", () => {
  expect(weekChangeBox(week)).toEqual({
    title: "Working week: Mon–Thu, 8 hours",
    detail: "From 1 Dec 2026.",
  });
});

it("names the people reached by a working week change", () => {
  expect(weekSaveLine(6, "Scotland", "2026-12-01")).toBe(
    "Saving changes the working week for the 6 people on Scotland, from 1 December 2026. Their allowances are worked out again from that date.",
  );
});

it("uses the singular when a working week change reaches one person", () => {
  expect(weekSaveLine(1, "Scotland", "2026-12-01")).toBe(
    "Saving changes the working week for the 1 person on Scotland, from 1 December 2026. Their allowances are worked out again from that date.",
  );
});

it("says nobody is reached when the terms have no people", () => {
  expect(weekSaveLine(0, "Scotland", "2026-12-01")).toBe(
    "Saving changes the working week for nobody on Scotland yet, from 1 December 2026.",
  );
});

it("leaves the count out while the working week's reach loads", () => {
  expect(weekSaveLine(null, "Scotland", "2026-12-01")).toBe(
    "Saving changes the working week for the people on Scotland, from 1 December 2026. Their allowances are worked out again from that date.",
  );
});

it("names the rules being changed and says earlier years stay as they were", () => {
  expect(rulesSaveLine(false, "Annual leave", 31, "England and Wales", "2027-01-01")).toBe(
    "Saving changes Annual leave for the 31 people on England and Wales, from 1 January 2027. Earlier years stay as they were.",
  );
});

it("describes offering a type to the person reached", () => {
  expect(rulesSaveLine(true, "Family leave", 1, "Northern Ireland", "2026-01-01")).toBe(
    "Saving offers Family leave to the 1 person on Northern Ireland, from 1 January 2026.",
  );
});

it("accepts working hours in quarter-hour steps", () => {
  expect(
    weekErrors({ ...week, hours: ["7.25", "0", "0", "0", "0", "0", "0"] }, "2026-01-01"),
  ).toEqual({});
});

it("refuses working hours between quarter-hour steps", () => {
  expect(
    weekErrors({ ...week, hours: ["7.3", "0", "0", "0", "0", "0", "0"] }, "2026-01-01"),
  ).toEqual({ hours: "Enter hours from 0 to 24, in quarter hours." });
});

it("requires at least one working day", () => {
  expect(weekErrors({ ...week, hours: ["0", "0", "0", "0", "0", "0", "0"] }, "2026-01-01")).toEqual(
    { hours: "At least one day needs hours." },
  );
});

it("refuses a working week starting before the earliest allowed date", () => {
  expect(weekErrors({ ...week, startDate: "2025-12-31" }, "2026-01-01")).toEqual({
    startDate: "Pick a date from 1 Jan 2026.",
  });
});

it.each(["366", "20.5"])("accepts %s days of yearly entitlement", (days) => {
  expect(rulesErrors({ ...rules, days }, "2026-01-01")).toEqual({});
});

it.each(["367", "20.3", "", "-1"])("refuses invalid yearly entitlement %j", (days) => {
  expect(rulesErrors({ ...rules, days }, "2026-01-01")).toEqual({
    days: "Enter days from 0 to 366, in half days.",
  });
});

it("refuses rules starting before the earliest allowed date", () => {
  expect(
    rulesErrors({ ...rules, appliesFrom: "ANOTHER_DATE", otherDate: "2025-12-31" }, "2026-01-01"),
  ).toEqual({ startDate: "Pick a date from 1 Jan 2026." });
});

it("prevents changing how an existing type counts in July", () => {
  expect(
    canChangeCounts(
      { ...rules, appliesFrom: "ANOTHER_DATE", otherDate: "2026-07-01" },
      "2026-01-01",
    ),
  ).toBe(false);
});

it("allows changing how a type counts at the start of next leave year", () => {
  expect(canChangeCounts({ ...rules, appliesFrom: "NEXT_LEAVE_YEAR" }, "2026-01-01")).toBe(true);
});

it("allows an offer to choose how leave counts in July", () => {
  expect(
    canChangeCounts(
      { ...rules, offer: true, appliesFrom: "ANOTHER_DATE", otherDate: "2026-07-01" },
      "2026-01-01",
    ),
  ).toBe(true);
});

it("confirms a working week saved from today", () => {
  expect(savedToast("Working week", "Scotland", "2026-11-06", "2026-11-06")).toBe(
    "Working week saved for Scotland.",
  );
});

it("adds the start date when a saved working week is planned", () => {
  expect(savedToast("Working week", "Scotland", "2026-12-01", "2026-11-06")).toBe(
    "Working week saved for Scotland. It changes on 1 Dec 2026.",
  );
});

it("compares the new working week's hours and days with the old week", () => {
  expect(weekHint(week, currentWeek)).toBe("32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours.");
});

it("starts a change of rules and an offer from this leave year", () => {
  expect(rulesDraftOf(currentRules).appliesFrom).toBe("THIS_LEAVE_YEAR");
  expect(rulesDraftOf(null).appliesFrom).toBe("THIS_LEAVE_YEAR");
});

it("says what each start does to the leave year", () => {
  expect(appliesFromHint({ ...rules, appliesFrom: "THIS_LEAVE_YEAR" }, "2026-01-01")).toBe(
    "This leave year, so 2026 allowances change now.",
  );
  expect(appliesFromHint(rules, "2026-01-01")).toBe("Next leave year. 2026 stays as it is.");
  expect(appliesFromHint({ ...rules, appliesFrom: "ANOTHER_DATE" }, "2026-01-01")).toBe(
    "Splits 2026 at that date.",
  );
});

it("says an offer from next leave year waits until then", () => {
  expect(appliesFromHint({ ...rules, offer: true }, "2026-01-01")).toBe(
    "Not offered until next leave year.",
  );
});

const week: WeekDraft = {
  hours: ["8", "8", "8", "8", "0", "0", "0"],
  calendar: "SCOTLAND",
  startDate: "2026-12-01",
};

const rules: RulesDraft = {
  offer: false,
  balance: "BALANCE_FROM_ALLOWANCE",
  days: "22",
  onTop: true,
  appliesFrom: "NEXT_LEAVE_YEAR",
  otherDate: "",
};

const currentRules: PolicyVersionText = {
  startDate: null,
  balance: "BALANCE_FROM_ALLOWANCE",
  bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
  yearlyEntitlement: { days: 20, daysPerWeek: 5 },
  leaveYearStart: { kind: "LEAVE_YEAR_FROM_FIXED_DATE", month: 1, day: 1 },
};

const currentWeek = {
  mondayMinutes: 450,
  tuesdayMinutes: 450,
  wednesdayMinutes: 450,
  thursdayMinutes: 450,
  fridayMinutes: 450,
  saturdayMinutes: 0,
  sundayMinutes: 0,
};
