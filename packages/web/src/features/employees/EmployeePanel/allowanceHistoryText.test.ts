import { expect, it } from "vitest";

import {
  adjustLabel,
  changeTitle,
  parseAdjustment,
  partsLine,
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

it.each([
  ["ALLOWANCE_ADJUSTED", "MANUAL_ADJUSTMENT", 2],
  ["ALLOWANCE_ADJUSTMENT_REVERSED", "MANUAL_ADJUSTMENT", -5],
  ["TIME_OFF_BOOKED", "TIME_OFF_BOOKED", -1],
  ["TIME_OFF_CANCELLED", "TIME_OFF_BOOKED", 1],
] as const)(
  "omits the parts line for %s when the title explains the only part",
  (cause, kind, amount) => {
    expect(partsLine({ cause, parts: [{ kind, amount }] })).toBeNull();
  },
);

it("shows the grant and booked day when a booking also creates the allowance", () => {
  expect(
    partsLine({
      cause: "TIME_OFF_BOOKED",
      parts: [
        { kind: "ENTITLEMENT_GRANT", amount: 20 },
        { kind: "TIME_OFF_BOOKED", amount: -1 },
      ],
    }),
  ).toBe("+20 granted, −1 booked");
});

it("joins signed grant and bank holiday parts in one line", () => {
  expect(partsLine(grant)).toBe("+28 granted, −8 bank holidays");
});

it.each([
  ["BANK_HOLIDAY_ALLOWANCE_GRANT", 8, "+8 bank holidays granted"],
  ["TIME_OFF_BOOKED", -2.5, "−2.5 booked"],
  ["MANUAL_ADJUSTMENT", 2, "+2 adjusted"],
  ["ROUNDING_UP_TO_HALF_DAY", 0.25, "+0.25 rounding"],
] as const)("labels the %s part", (kind, amount, expected) => {
  expect(partsLine({ ...grant, parts: [{ kind, amount }] })).toBe(expected);
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

it("explains how reversing added days takes them away", () => {
  const words = reverseWords(
    { amount: 5, recordedAt },
    { remaining: 16.5, firstName: "Aisha", isReader: false },
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
  );

  expect(words.body).toBe(
    "This gives back the 2 days taken away on 27 Nov. Aisha will have 11 days left.",
  );
});

it("addresses the reader when reversing their own adjustment", () => {
  const words = reverseWords(
    { amount: 5, recordedAt },
    { remaining: 16.5, firstName: "Aisha", isReader: true },
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
  parts: [
    { kind: "ENTITLEMENT_GRANT" as const, amount: 28 },
    { kind: "BANK_HOLIDAY_TAKEN" as const, amount: -8 },
  ],
  author: { kind: "BROCCOLI_ITSELF" as const, userId: null, email: null },
  comment: null,
};
