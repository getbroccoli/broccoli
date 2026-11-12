import { expect, it } from "vitest";

import {
  balanceLines,
  bookedToast,
  bookingDates,
  bookingTooltip,
  costSentence,
  monthRange,
  offCounts,
  parseMonth,
  refusalMessage,
  shiftMonth,
} from "./timeOffText";

it.each([
  ["2026-12-07", "2026-12-09", "7–9 Dec 2026"],
  ["2026-12-30", "2027-01-04", "30 Dec 2026 – 4 Jan 2027"],
  ["2026-11-03", "2026-11-03", "3 Nov 2026"],
  ["2026-11-30", "2026-12-02", "30 Nov – 2 Dec 2026"],
])("formats booking dates from %s to %s as %s", (startDate, endDate, expected) => {
  expect(bookingDates(startDate, endDate)).toBe(expected);
});

it.each([
  ["2026-12", "2026-12-01", "2026-12-31"],
  ["2026-02", "2026-02-01", "2026-02-28"],
  ["2028-02", "2028-02-01", "2028-02-29"],
])("returns the inclusive dates of %s", (month, from, until) => {
  expect(monthRange(month)).toEqual({ from, until });
});

it.each([
  ["2026-12", 1, "2027-01"],
  ["2026-01", -1, "2025-12"],
] as const)("shifts %s by %s month across the year boundary", (month, by, expected) => {
  expect(shiftMonth(month, by)).toBe(expected);
});

it("keeps a valid month from the search value", () => {
  expect(parseMonth("2026-12", "2026-11-09")).toBe("2026-12");
});

it.each(["2026-13", "x", undefined])(
  "uses today's month for an invalid search value %s",
  (value) => {
    expect(parseMonth(value, "2026-11-09")).toBe("2026-11");
  },
);

it.each([
  [2.5, "That's 2.5 days."],
  [1, "That's 1 day."],
] as const)("describes a cost of %s without bank holidays", (cost, expected) => {
  expect(costSentence({ cost, days: [] })).toBe(expected);
});

it("names Christmas bank holidays and excludes weekends from the comparison", () => {
  const sentence = costSentence({
    cost: 5,
    days: [
      { date: "2026-12-24", reason: "WORKING_DAY", bankHolidayName: null },
      { date: "2026-12-25", reason: "BANK_HOLIDAY", bankHolidayName: "Christmas Day" },
      { date: "2026-12-26", reason: "NOT_A_WORKING_DAY", bankHolidayName: null },
      { date: "2026-12-27", reason: "NOT_A_WORKING_DAY", bankHolidayName: null },
      { date: "2026-12-28", reason: "BANK_HOLIDAY", bankHolidayName: "Boxing Day" },
      { date: "2026-12-29", reason: "WORKING_DAY", bankHolidayName: null },
      { date: "2026-12-30", reason: "WORKING_DAY", bankHolidayName: null },
      { date: "2026-12-31", reason: "WORKING_DAY", bankHolidayName: null },
      { date: "2027-01-01", reason: "BANK_HOLIDAY", bankHolidayName: "New Year's Day" },
      { date: "2027-01-02", reason: "NOT_A_WORKING_DAY", bankHolidayName: null },
      { date: "2027-01-03", reason: "NOT_A_WORKING_DAY", bankHolidayName: null },
      { date: "2027-01-04", reason: "WORKING_DAY", bankHolidayName: null },
    ],
  });

  expect(sentence).toBe(
    "That's 5 days, not 8. Fri 25 Dec is Christmas Day, Mon 28 Dec is Boxing Day, Fri 1 Jan is New Year's Day.",
  );
});

it("shows a single balance without a year label", () => {
  const lines = balanceLines(
    [
      {
        periodStart: "2026-01-01",
        balance: "BALANCE_FROM_ALLOWANCE",
        remainingBefore: 20,
        remainingAfter: 17.5,
        usedAfter: 2.5,
      },
    ],
    "Sam",
  );

  expect(lines).toEqual([{ label: null, before: 20, after: 17.5, over: null, unlimited: null }]);
});

it("labels each balance when the booking crosses leave years", () => {
  const lines = balanceLines(
    [
      {
        periodStart: "2026-01-01",
        balance: "BALANCE_FROM_ALLOWANCE",
        remainingBefore: 17.5,
        remainingAfter: 13.5,
        usedAfter: 6.5,
      },
      {
        periodStart: "2027-01-01",
        balance: "BALANCE_FROM_ALLOWANCE",
        remainingBefore: 20,
        remainingAfter: 19,
        usedAfter: 1,
      },
    ],
    "Sam",
  );

  expect(lines).toEqual([
    { label: "2026:", before: 17.5, after: 13.5, over: null, unlimited: null },
    { label: "2027:", before: 20, after: 19, over: null, unlimited: null },
  ]);
});

it("explains that a booking beyond the balance is still allowed", () => {
  const lines = balanceLines(
    [
      {
        periodStart: "2026-01-01",
        balance: "BALANCE_FROM_ALLOWANCE",
        remainingBefore: 2,
        remainingAfter: -0.5,
        usedAfter: 20.5,
      },
    ],
    "Sam",
  );

  expect(lines).toEqual([
    {
      label: null,
      before: 2,
      after: -0.5,
      over: "0.5 days more than Sam has. You can still book it.",
      unlimited: null,
    },
  ]);
});

it("shows the used-after figure for an unlimited balance", () => {
  const lines = balanceLines(
    [
      {
        periodStart: "2026-01-01",
        balance: "UNLIMITED_BALANCE",
        remainingBefore: null,
        remainingAfter: null,
        usedAfter: 3,
      },
    ],
    "Sam",
  );

  expect(lines).toEqual([
    {
      label: null,
      before: null,
      after: null,
      over: null,
      unlimited: "Unlimited. 3 days used this year.",
    },
  ]);
});

it.each([
  {
    reason: "CLASHES_WITH_TIME_OFF",
    date: "2026-12-08",
    typeName: null,
    expected: "Sam already has time off on Tue 8 Dec. Change the dates.",
  },
  {
    reason: "NO_WORKING_DAYS",
    date: null,
    typeName: "Annual leave",
    expected: "These dates are all days Sam doesn't work.",
  },
  {
    reason: "TYPE_NOT_OFFERED",
    date: "2027-01-04",
    typeName: "Family leave",
    expected: "Family leave isn't offered to Sam on 4 Jan 2027.",
  },
  {
    reason: "OUTSIDE_BOOKING_WINDOW",
    date: null,
    typeName: "Annual leave",
    expected: "Pick dates from 1 Jan 2026 to 31 Dec 2027.",
  },
  {
    reason: "OUTSIDE_EMPLOYMENT",
    date: "2027-01-04",
    typeName: "Annual leave",
    expected: "Sam isn't employed on 4 Jan 2027.",
  },
  {
    reason: "LONGER_THAN_A_YEAR",
    date: null,
    typeName: "Annual leave",
    expected: "Book at most a year at a time.",
  },
] as const)("explains $reason with type $typeName", ({ reason, date, typeName, expected }) => {
  const message = refusalMessage(
    { reason, date },
    {
      firstName: "Sam",
      typeName,
      window: { from: "2026-01-01", until: "2027-12-31" },
    },
  );

  expect(message).toBe(expected);
});

it.each([
  {
    typeName: "Annual leave",
    startDate: "2026-12-07",
    endDate: "2026-12-09",
    cost: 2.5,
    expected: "Annual leave · 7–9 Dec · 2.5 days",
  },
  {
    typeName: "Annual leave",
    startDate: "2026-12-30",
    endDate: "2027-01-04",
    cost: 3,
    expected: "Annual leave · 30 Dec – 4 Jan · 3 days",
  },
  {
    typeName: null,
    startDate: "2026-11-03",
    endDate: "2026-11-03",
    cost: null,
    expected: "Off · 3 Nov",
  },
])("formats a booking tooltip as $expected", ({ expected, ...booking }) => {
  expect(bookingTooltip(booking)).toBe(expected);
});

it("counts each person off on each date", () => {
  const people = [
    { timeOff: [{ days: [{ date: "2026-12-07" }, { date: "2026-12-08" }] }] },
    { timeOff: [{ days: [{ date: "2026-12-08" }] }] },
    { timeOff: [] },
  ];

  expect(offCounts(people)).toEqual(
    new Map([
      ["2026-12-07", 1],
      ["2026-12-08", 2],
    ]),
  );
});

it("counts a person with morning and afternoon bookings on the same date only once", () => {
  const people = [
    {
      timeOff: [
        { days: [{ date: "2026-12-07", dayPart: "MORNING" }] },
        { days: [{ date: "2026-12-07", dayPart: "AFTERNOON" }] },
      ],
    },
    { timeOff: [{ days: [{ date: "2026-12-07", dayPart: "MORNING" }] }] },
  ];

  expect(offCounts(people)).toEqual(new Map([["2026-12-07", 2]]));
});

it.each([
  [2.5, false, "2.5 days booked for Sam."],
  [1, true, "1 day booked for you."],
] as const)("confirms a %s-day booking with self %s", (cost, isSelf, expected) => {
  expect(bookedToast(cost, "Sam", isSelf)).toBe(expected);
});
