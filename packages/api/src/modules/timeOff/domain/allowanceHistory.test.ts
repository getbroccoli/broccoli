import { expect, it } from "vitest";

import { calendarDate } from "#test/support";

import { allowanceHistory, type StoredLedgerLine } from "./allowanceHistory";

it("groups all lines written at the same time for the same cause and reference", () => {
  const history = allowanceHistory([
    line(1, { amount: "28" }),
    line(2, { kind: "bank_holiday_taken", amount: "-1" }),
  ]);

  expect(history).toMatchObject([
    { recordedAt: grantTime, cause: "time_off_turned_on", amount: 27 },
  ]);
});

it("keeps different causes and references apart even at the same time", () => {
  const history = allowanceHistory([
    line(1, { causeKind: "terms_changed", causeRef: "2026-09-01", amount: "1" }),
    line(2, { causeKind: "working_pattern_changed", causeRef: "2026-09-01", amount: "2" }),
    line(3, { causeKind: "terms_changed", causeRef: "2026-10-01", amount: "3" }),
  ]);

  expect(history.map(({ amount }) => amount).sort()).toEqual([1, 2, 3]);
});

it("lists changes newest first, breaking time ties by each change's smallest line id", () => {
  const history = allowanceHistory([
    line(4, { causeKind: "employee_added" }),
    line(2, { causeKind: "daily_check" }),
    line(1, { causeKind: "employee_added" }),
    line(3, { createdAt: laterTime, causeKind: "daily_check" }),
  ]);

  expect(history).toMatchObject([
    { recordedAt: laterTime, cause: "daily_check", balanceAfter: 4 },
    { recordedAt: grantTime, cause: "daily_check", balanceAfter: 3 },
    { recordedAt: grantTime, cause: "employee_added", balanceAfter: 2 },
  ]);
});

it("takes each amount from the difference between successive rounded remaining figures", () => {
  const history = allowanceHistory([
    line(1, { amount: "6.214286" }),
    line(2, { kind: "rounding_up_to_half_day", amount: "0.285714" }),
    line(3, { kind: "bank_holiday_taken", amount: "-1" }),
    line(4, { kind: "bank_holiday_taken", amount: "-1" }),
    line(5, { createdAt: laterTime, causeKind: "terms_changed", amount: "0.006" }),
    line(6, { createdAt: laterTime, causeKind: "working_pattern_changed", amount: "0.006" }),
  ]);

  expect(history).toMatchObject([
    { amount: 0.01, balanceAfter: 4.51 },
    { amount: 4.5, balanceAfter: 4.5 },
  ]);
});

it("shows allowance, bank holidays taken and days used after each change", () => {
  const history = allowanceHistory([
    line(1, { amount: "6.25" }),
    line(2, { kind: "rounding_up_to_half_day", amount: "0.25" }),
    line(3, { kind: "bank_holiday_taken", amount: "-1" }),
    line(4, {
      createdAt: laterTime,
      causeKind: "time_off_booked",
      kind: "time_off_booked",
      amount: "-2",
    }),
  ]);

  expect(history).toMatchObject([
    { entitlementAfter: 6.5, bankHolidaysAfter: 1, usedAfter: 2 },
    { entitlementAfter: 6.5, bankHolidaysAfter: 1, usedAfter: 0 },
  ]);
});

it("omits a change whose lines cancel out within the allowance", () => {
  const history = allowanceHistory([
    line(1, { amount: "2" }),
    line(2, { kind: "bank_holiday_allowance_grant", amount: "-2" }),
  ]);

  expect(history).toEqual([]);
});

it("lists a zero-amount change when the allowance and bank holidays taken both increase", () => {
  const history = allowanceHistory([
    line(1, { amount: "1" }),
    line(2, { kind: "bank_holiday_taken", amount: "-1" }),
  ]);

  expect(history).toMatchObject([{ amount: 0, entitlementAfter: 1, bankHolidaysAfter: 1 }]);
});

it("keeps both adjustments and their authors when opposite amounts are recorded at the same time", () => {
  const adjustment = {
    kind: "manual_adjustment",
    causeKind: "allowance_adjusted",
    causeRef: null,
    createdAt: grantTime,
  } as const;
  const userA = { kind: "SIGNED_IN_USER", id: "user-a" } as const;
  const userB = { kind: "SIGNED_IN_USER", id: "user-b" } as const;

  const history = allowanceHistory([
    line(1, { ...adjustment, amount: "2", reason: "Carry-over", author: userA }),
    line(2, { ...adjustment, amount: "-2", reason: "Correction", author: userB }),
  ]);

  expect(history).toMatchObject([
    {
      cause: "allowance_adjusted",
      amount: -2,
      balanceAfter: 0,
      comment: "Correction",
      author: userB,
    },
    {
      cause: "allowance_adjusted",
      amount: 2,
      balanceAfter: 2,
      comment: "Carry-over",
      author: userA,
    },
  ]);
});

it("takes the comment and author from the manual adjustment line", () => {
  const author = { kind: "SIGNED_IN_USER", id: "test-owner" } as const;
  const history = allowanceHistory([
    line(1, { causeKind: "allowance_adjusted" }),
    line(2, {
      kind: "manual_adjustment",
      causeKind: "allowance_adjusted",
      reason: "Carry-over",
      author,
    }),
  ]);

  expect(history[0]).toMatchObject({ author, comment: "Carry-over" });
});

it("identifies an adjustment by its ledger line id", () => {
  const adjustment = line(1, { kind: "manual_adjustment", causeKind: "allowance_adjusted" });

  expect(allowanceHistory([adjustment])).toMatchObject([
    { adjustmentId: adjustment.id, reversed: false },
  ]);
});

it("marks only the reversed adjustment and lists its reversal as a separate change", () => {
  const adjustment = line(1, { kind: "manual_adjustment", causeKind: "allowance_adjusted" });
  const other = line(2, { kind: "manual_adjustment", causeKind: "allowance_adjusted" });
  const reversal = line(3, {
    kind: "manual_adjustment",
    causeKind: "allowance_adjustment_reversed",
    causeRef: adjustment.id,
    amount: "-1",
    createdAt: laterTime,
  });

  expect(allowanceHistory([adjustment, other, reversal])).toMatchObject([
    {
      cause: "allowance_adjustment_reversed",
      adjustmentId: reversal.id,
      reversed: false,
      amount: -1,
    },
    { cause: "allowance_adjusted", adjustmentId: other.id, reversed: false },
    { cause: "allowance_adjusted", adjustmentId: adjustment.id, reversed: true },
  ]);
});

it("leaves the adjustment id null on other balance changes", () => {
  expect(allowanceHistory([line(1, { causeKind: "employee_added" })])).toMatchObject([
    { adjustmentId: null, reversed: false },
  ]);
});

it.each([
  ["start_date_changed", "2026-02-01", "2026-02-01"],
  ["working_pattern_changed", "2026-09-01", "2026-09-01"],
  ["terms_changed", "2026-10-01", "2026-10-01"],
  ["time_off_rules_changed", "policy-id:2026-11-01", "2026-11-01"],
  ["daily_check", "2026-11-26", null],
] as const)("reads the cause date for %s", (causeKind, causeRef, expected) => {
  const history = allowanceHistory([line(1, { causeKind, causeRef })]);

  expect(history[0]!.causeDate).toBe(expected);
});

it("takes the first and last effective dates from booked lines only", () => {
  const cause = { causeKind: "time_off_booked", causeRef: "booking-id" } as const;
  const history = allowanceHistory([
    line(1, {
      ...cause,
      kind: "time_off_booked",
      effectiveDate: calendarDate("2026-12-09"),
      amount: "-0.5",
    }),
    line(2, {
      ...cause,
      kind: "time_off_booked",
      effectiveDate: calendarDate("2026-12-07"),
      amount: "-1",
    }),
    line(3, {
      ...cause,
      kind: "time_off_booked",
      effectiveDate: calendarDate("2026-12-08"),
      amount: "-1",
    }),
    line(4, cause),
  ]);

  expect(history[0]!.bookedDays).toEqual({ first: "2026-12-07", last: "2026-12-09" });
});

const grantTime = new Date("2026-11-02T08:00:00Z");
const laterTime = new Date("2026-11-26T14:05:00Z");

function line(sequence: number, fields: Partial<StoredLedgerLine>): StoredLedgerLine {
  return {
    id: `019a0000-0000-7000-8000-${String(sequence).padStart(12, "0")}`,
    kind: "entitlement_grant",
    amount: "1",
    effectiveDate: calendarDate("2026-01-01"),
    causeKind: "time_off_turned_on",
    causeRef: null,
    reason: null,
    author: { kind: "BROCCOLI_ITSELF", id: null },
    createdAt: grantTime,
    ...fields,
  };
}
