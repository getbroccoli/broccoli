import { expect, it } from "vitest";

import {
  adjustLabel,
  changeTitle,
  figureLines,
  parseAdjustment,
  recordedDate,
  reverseWords,
  signedDays,
} from "./allowanceHistoryText";

it.each([
  ["TIME_OFF_TURNED_ON", null, "Time off turned on"],
  ["EMPLOYEE_ADDED", null, "Added to Broccoli"],
  ["LEAVE_YEAR_STARTED", null, "Leave year started"],
  ["START_DATE_CHANGED", "2026-02-01", "Start date changed to 1 Feb 2026"],
  ["WORKING_PATTERN_CHANGED", "2026-09-01", "Working week changed from 1 Sept 2026"],
  ["TERMS_CHANGED", "2026-09-01", "Terms changed from 1 Sept 2026"],
  ["TIME_OFF_RULES_CHANGED", "2026-09-01", "Time off rules changed from 1 Sept 2026"],
  ["DAILY_CHECK", null, "Recalculated"],
] as const)("names the change for %s", (cause, causeDate, expected) => {
  expect(changeTitle({ ...grant, cause, causeDate }, "reader")).toBe(expected);
});

it.each([
  ["START_DATE_CHANGED", "Start date cleared"],
  ["WORKING_PATTERN_CHANGED", "Working week changed"],
  ["TERMS_CHANGED", "Terms changed"],
  ["TIME_OFF_RULES_CHANGED", "Time off rules changed"],
] as const)("names %s when the cause has no date", (cause, expected) => {
  expect(changeTitle({ ...grant, cause, causeDate: null }, "reader")).toBe(expected);
});

it.each(["TIME_OFF_BOOKED", "TIME_OFF_CANCELLED"] as const)(
  "describes %s as a recalculation when the allowance has no booked days",
  (cause) => {
    const change = { ...grant, cause, firstBookedDay: null, lastBookedDay: null };
    expect(changeTitle(change, "reader")).toBe("Recalculated");
  },
);

it.each([
  ["TIME_OFF_BOOKED", "Booked 7–9 Dec 2026"],
  ["TIME_OFF_APPROVED", "Approved 7–9 Dec 2026"],
  ["TIME_OFF_CANCELLED", "Booking for 7–9 Dec 2026 cancelled"],
] as const)("names the booked dates for %s", (cause, expected) => {
  const change = { ...grant, cause, firstBookedDay: "2026-12-07", lastBookedDay: "2026-12-09" };

  expect(changeTitle(change, "reader")).toBe(expected);
});

it.each([
  ["hannah", "Adjusted by you"],
  ["another-reader", "Adjusted by hannah@example.com"],
])("names the adjustment author for reader %s", (reader, expected) => {
  const change = {
    ...grant,
    cause: "ALLOWANCE_ADJUSTED" as const,
    author: { kind: "SIGNED_IN_USER" as const, userId: "hannah", email: "hannah@example.com" },
  };

  expect(changeTitle(change, reader)).toBe(expected);
});

it.each([
  ["hannah", "Adjustment of +5 reversed by you"],
  ["another-reader", "Adjustment of +5 reversed by hannah@example.com"],
])("names the reversed adjustment and its author for reader %s", (reader, expected) => {
  const change = {
    ...grant,
    cause: "ALLOWANCE_ADJUSTMENT_REVERSED" as const,
    amount: -5,
    adjustmentId: "reversal",
    author: { kind: "SIGNED_IN_USER" as const, userId: "hannah", email: "hannah@example.com" },
  };

  expect(changeTitle(change, reader)).toBe(expected);
});

it("shows how each figure in a working week change affects the days left", () => {
  const previous = { entitlementAfter: 28, bankHolidaysAfter: 8, usedAfter: 10 };
  const lines = figureLines(
    {
      cause: "WORKING_PATTERN_CHANGED",
      entitlementAfter: 26.5,
      bankHolidaysAfter: 7,
      usedAfter: 6,
    },
    previous,
  );

  expect(lines).toEqual([
    { text: "Allowance 28 → 26.5", amount: "−1.5" },
    { text: "Bank holidays taken 8 → 7", amount: "+1" },
    { text: "Used 10 → 6", amount: "+4" },
  ]);
});

it("counts the oldest change's figures from zero", () => {
  expect(figureLines(grant, undefined)).toEqual([
    { text: "Allowance 0 → 28", amount: "+28" },
    { text: "Bank holidays taken 0 → 8", amount: "−8" },
  ]);
});

it("shows only the allowance when a rules change leaves the other figures alone", () => {
  const previous = { entitlementAfter: 26.5, bankHolidaysAfter: 7, usedAfter: 6 };
  const lines = figureLines(
    { ...previous, cause: "TIME_OFF_RULES_CHANGED", entitlementAfter: 35.5 },
    previous,
  );

  expect(lines).toEqual([{ text: "Allowance 26.5 → 35.5", amount: "+9" }]);
});

it.each([
  ["ALLOWANCE_ADJUSTED", 30, 1],
  ["ALLOWANCE_ADJUSTMENT_REVERSED", 26, 1],
  ["TIME_OFF_BOOKED", 28, 2],
  ["TIME_OFF_APPROVED", 28, 2],
  ["TIME_OFF_CANCELLED", 28, 0],
] as const)(
  "omits the only changed figure when the %s title explains it",
  (cause, entitlementAfter, usedAfter) => {
    const previous = { entitlementAfter: 28, bankHolidaysAfter: 8, usedAfter: 1 };

    expect(figureLines({ ...previous, cause, entitlementAfter, usedAfter }, previous)).toEqual([]);
  },
);

it("shows allowance and used days when a booking also starts the allowance", () => {
  const lines = figureLines(
    { cause: "TIME_OFF_BOOKED", entitlementAfter: 20, bankHolidaysAfter: 0, usedAfter: 1 },
    undefined,
  );

  expect(lines).toEqual([
    { text: "Allowance 0 → 20", amount: "+20" },
    { text: "Used 0 → 1", amount: "−1" },
  ]);
});

it.each([
  [2, "+2"],
  [-2.5, "−2.5"],
  [0.25, "+0.25"],
] as const)("formats %s days as %s", (amount, expected) => {
  expect(signedDays(amount)).toBe(expected);
});

it.each([
  ["2", 2],
  ["-1.5", -1.5],
  ["−1.5", -1.5],
  [" 0.25 ", 0.25],
  ["366", 366],
  ["-366", -366],
  ["", null],
  ["0", null],
  ["1.234", null],
  ["367", null],
  ["-367", null],
  ["abc", null],
] as const)("parses adjustment input %j as %s", (text, expected) => {
  expect(parseAdjustment(text)).toBe(expected);
});

it.each([
  [2, "Add 2 days"],
  [1, "Add 1 day"],
  [-1.5, "Take away 1.5 days"],
  [-0.5, "Take away 0.5 days"],
] as const)("labels a %s-day adjustment as %s", (amount, expected) => {
  expect(adjustLabel(amount)).toBe(expected);
});

it("omits the year when the recorded London day is in the current year", () => {
  expect(recordedDate("2026-07-26T23:30:00Z", "2026-11-27")).toBe("27 Jul");
});

it("includes the year when the adjustment was recorded in an earlier year", () => {
  expect(recordedDate("2025-11-27T12:00:00Z", "2026-11-27")).toBe("27 Nov 2025");
});

it("uses the London date for an adjustment recorded late at night", () => {
  expect(recordedDate("2026-11-27T23:30:00Z", "2026-11-28")).toBe("27 Nov");
});

it("explains how reversing added days takes them away", () => {
  const words = reverseWords(
    { amount: 5, recordedAt },
    { remaining: 16.5, firstName: "Aisha", isReader: false },
    "2026-11-28",
  );

  expect(words).toEqual({
    title: "Reverse this adjustment?",
    body: "This takes away the 5 days added on 27 Nov. Aisha will have 11.5 days left.",
    keep: "Keep adjustment",
    confirm: "Reverse adjustment",
    done: "Adjustment reversed.",
  });
});

it("explains how reversing a deduction gives days back", () => {
  const words = reverseWords(
    { amount: -2, recordedAt },
    { remaining: 9, firstName: "Aisha", isReader: false },
    "2026-11-28",
  );

  expect(words.body).toBe(
    "This gives back the 2 days taken away on 27 Nov. Aisha will have 11 days left.",
  );
});

it("addresses the reader when reversing their own adjustment", () => {
  const words = reverseWords(
    { amount: 5, recordedAt },
    { remaining: 16.5, firstName: "Aisha", isReader: true },
    "2026-11-28",
  );

  expect(words.body).toBe(
    "This takes away the 5 days added on 27 Nov. You will have 11.5 days left.",
  );
});

const recordedAt = "2026-11-28T00:30:00+01:00";

const grant = {
  adjustmentId: null,
  reversed: false,
  recordedAt: "2026-11-02T08:00:00Z",
  cause: "TIME_OFF_TURNED_ON" as const,
  causeDate: null,
  firstBookedDay: null,
  lastBookedDay: null,
  amount: 20,
  balanceAfter: 20,
  entitlementAfter: 28,
  bankHolidaysAfter: 8,
  usedAfter: 0,
  author: { kind: "BROCCOLI_ITSELF" as const, userId: null, email: null },
  comment: null,
};
