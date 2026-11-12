import { expect, it } from "vitest";

import { calendarDate } from "#test/support";

import type { DatedPolicy } from "./allowanceCalculator";
import { chargedDays } from "./chargedDays";

it("keeps every booked day when no policy counts from an allowance", () => {
  const days = ["2027-06-30", "2027-07-01"].map((date) => ({ date: calendarDate(date) }));
  const policies: DatedPolicy[] = [
    {
      startDate: null,
      endDate: null,
      balance: "unlimited_balance",
      bankHolidays: null,
      rules: [],
    },
  ];

  expect(chargedDays(days, policies)).toEqual(days);
});

it("charges only days within allowance rules, including both boundary dates", () => {
  const days = ["2027-06-30", "2027-07-01", "2027-07-02", "2027-07-03"].map((date) => ({
    date: calendarDate(date),
  }));
  const policies: DatedPolicy[] = [
    {
      startDate: null,
      endDate: calendarDate("2027-06-30"),
      balance: "unlimited_balance",
      bankHolidays: null,
      rules: [],
    },
    {
      startDate: calendarDate("2027-07-01"),
      endDate: calendarDate("2027-07-02"),
      balance: "balance_from_allowance",
      bankHolidays: "bank_holidays_included_in_allowance",
      rules: [],
    },
    {
      startDate: calendarDate("2027-07-03"),
      endDate: null,
      balance: "no_balance",
      bankHolidays: null,
      rules: [],
    },
  ];

  expect(chargedDays(days, policies)).toEqual([
    { date: calendarDate("2027-07-01") },
    { date: calendarDate("2027-07-02") },
  ]);
});
