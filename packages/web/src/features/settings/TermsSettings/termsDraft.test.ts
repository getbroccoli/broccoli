import { expect, it } from "vitest";

import {
  changesOnlyDays,
  peopleText,
  rulesChangeBox,
  rulesErrors,
  rulesDraftOf,
  weekChangeBox,
  type RulesDraft,
} from "./termsDraft";
import type { RuleText } from "@/features/termsDisplay";

it("summarises a days-only change and the bank holidays that stay on top", () => {
  expect(rulesChangeBox("Annual leave", nextRules, currentRules, "2027-01-01")).toEqual({
    title: "Annual leave: 20 → 22 days",
    detail: "From 1 Jan 2027, bank holidays still on top",
  });
});

it("summarises an offer of recorded leave", () => {
  const offer: RuleText = {
    balance: "NO_BALANCE",
    bankHolidays: null,
    yearlyEntitlement: null,
  };

  expect(rulesChangeBox("Family leave", offer, null, "2026-01-01")).toEqual({
    title: "Family leave: offered, Recorded, doesn't count",
    detail: "From 1 Jan 2026.",
  });
});

it("summarises a change to unlimited leave", () => {
  expect(
    rulesChangeBox(
      "Annual leave",
      { balance: "UNLIMITED_BALANCE", bankHolidays: null, yearlyEntitlement: null },
      currentRules,
      "2027-01-01",
    ),
  ).toEqual({
    title: "Annual leave: Unlimited",
    detail: "From 1 Jan 2027.",
  });
});

it("recognises a days-only change when counting and bank holidays stay the same", () => {
  expect(changesOnlyDays(nextRules, currentRules)).toBe(true);
});

it("does not treat a bank holiday change as a days-only change", () => {
  expect(
    changesOnlyDays(
      { ...nextRules, bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" },
      currentRules,
    ),
  ).toBe(false);
});

it("does not treat an offer as a days-only change", () => {
  expect(changesOnlyDays(nextRules, null)).toBe(false);
});

it("summarises a new working week and when it starts", () => {
  const nextWeek = {
    mondayMinutes: 480,
    tuesdayMinutes: 480,
    wednesdayMinutes: 480,
    thursdayMinutes: 480,
    fridayMinutes: 0,
    saturdayMinutes: 0,
    sundayMinutes: 0,
  };

  expect(weekChangeBox(nextWeek, "2026-12-01")).toEqual({
    title: "Working week: Mon–Thu, 8 hours",
    detail: "From 1 Dec 2026.",
  });
});

it.each([
  { count: 6, text: "the 6 people" },
  { count: 1, text: "the 1 person" },
  { count: 0, text: "the 0 people" },
  { count: null, text: "the people" },
])("describes the people reached as $text", ({ count, text }) => {
  expect(peopleText(count)).toBe(text);
});

it.each(["366", "20.5"])("accepts %s days of yearly entitlement", (days) => {
  expect(rulesErrors({ ...rules, days })).toEqual({});
});

it.each(["367", "20.3", "", "-1"])("refuses invalid yearly entitlement %j", (days) => {
  expect(rulesErrors({ ...rules, days })).toEqual({
    days: "Enter days from 0 to 366, in half days.",
  });
});

it.each([
  { balance: "NO_BALANCE", entitlementDays: null, bankHolidays: null, days: "", onTop: true },
  {
    balance: "UNLIMITED_BALANCE",
    entitlementDays: null,
    bankHolidays: null,
    days: "",
    onTop: true,
  },
  {
    balance: "BALANCE_FROM_ALLOWANCE",
    entitlementDays: 12.5,
    bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
    days: "12.5",
    onTop: true,
  },
  {
    balance: "BALANCE_FROM_ALLOWANCE",
    entitlementDays: 28,
    bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE",
    days: "28",
    onTop: false,
  },
] as const)(
  "starts an offer from the type defaults: $balance, $days days, on top $onTop",
  ({ balance, entitlementDays, bankHolidays, days, onTop }) => {
    expect(rulesDraftOf(null, { balance, entitlementDays, bankHolidays }, true)).toEqual({
      offer: true,
      balance,
      days,
      onTop,
    });
  },
);

it("starts editing from today's policy version instead of the type defaults", () => {
  expect(
    rulesDraftOf(
      { ...currentRules, bankHolidays: "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" },
      defaultRules,
      false,
    ),
  ).toEqual({
    offer: false,
    balance: "BALANCE_FROM_ALLOWANCE",
    days: "20",
    onTop: false,
  });
});

it("keeps a saved unpublished offer marked as an offer when editing it again", () => {
  expect(rulesDraftOf(nextRules, defaultRules, true)).toEqual({
    offer: true,
    balance: "BALANCE_FROM_ALLOWANCE",
    days: "22",
    onTop: true,
  });
});

const rules: RulesDraft = {
  offer: false,
  balance: "BALANCE_FROM_ALLOWANCE",
  days: "22",
  onTop: true,
};

const currentRules: RuleText = {
  balance: "BALANCE_FROM_ALLOWANCE",
  bankHolidays: "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE",
  yearlyEntitlement: { days: 20, daysPerWeek: 5 },
};

const nextRules: RuleText = {
  ...currentRules,
  yearlyEntitlement: { days: 22, daysPerWeek: 5 },
};

const defaultRules = {
  balance: "NO_BALANCE",
  entitlementDays: null,
  bankHolidays: null,
} as const;
