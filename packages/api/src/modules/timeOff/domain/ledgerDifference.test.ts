import { expect, it } from "vitest";

import { allowanceInputs, calendarDate } from "#test/support";

import { calculateAllowance } from "./allowanceCalculator";
import { type LedgerSum, ledgerDifference, type NewLedgerLine } from "./ledgerDifference";

const allowance = { id: "allowance", leaveYearStart: calendarDate("2026-01-01") };
const linked = { kind: "POLICY_LINKED_TO_GROUP", ref: "group" } as const;

it("writes every calculated line except a zero rounding for a new allowance", () => {
  const lines = ledgerDifference(allowance, calculateAllowance(allowanceInputs()), [], linked);

  expect(rowsOf(lines)).toEqual([
    ["entitlement_grant", "yearly", "28", "2026-01-01", "allowance:entitlement_grant:yearly:0"],
    ...[
      "2026-01-01",
      "2026-04-03",
      "2026-04-06",
      "2026-05-04",
      "2026-05-25",
      "2026-08-31",
      "2026-12-25",
      "2026-12-28",
    ].map((date) => [
      "bank_holiday_taken",
      null,
      "-1",
      date,
      `allowance:bank_holiday_taken:${date}:0`,
    ]),
  ]);
  expect(
    lines.every(
      ({ causeKind, causeRef }) => causeKind === "policy_linked_to_group" && causeRef === "group",
    ),
  ).toEqual(true);
});

it("appends only the differences of a September switch to Tuesday through Thursday", () => {
  const before = ledgerDifference(allowance, calculateAllowance(allowanceInputs()), [], linked);
  const inputs = allowanceInputs();
  inputs.workingWeeks = [
    ...inputs.workingWeeks,
    {
      ...inputs.workingWeeks[0]!,
      effectiveFrom: calendarDate("2026-09-01"),
      minutes: [0, 450, 450, 450, 0, 0, 0],
    },
  ];

  const lines = ledgerDifference(allowance, calculateAllowance(inputs), sumsOf(before), {
    kind: "WORKING_PATTERN_CHANGED",
    ref: "2026-09-01",
  });

  expect(rowsOf(lines)).toEqual([
    [
      "entitlement_grant",
      "yearly",
      "-3.743562",
      "2026-09-01",
      "allowance:entitlement_grant:yearly:1",
    ],
    ["bank_holiday_taken", null, "1", "2026-12-25", "allowance:bank_holiday_taken:2026-12-25:1"],
    ["bank_holiday_taken", null, "1", "2026-12-28", "allowance:bank_holiday_taken:2026-12-28:1"],
    [
      "rounding_up_to_half_day",
      null,
      "0.243562",
      "2026-09-01",
      "allowance:rounding_up_to_half_day:0",
    ],
  ]);
  expect(lines.every(({ causeKind }) => causeKind === "working_pattern_changed")).toEqual(true);
});

it("appends nothing when the ledger already adds up to the calculation", () => {
  const target = calculateAllowance(allowanceInputs());
  const written = ledgerDifference(allowance, target, [], linked);

  expect(ledgerDifference(allowance, target, sumsOf(written), linked)).toEqual([]);
});

function rowsOf(lines: readonly NewLedgerLine[]) {
  return lines.map((line) => [
    line.kind,
    line.allowanceRuleId,
    line.amount,
    line.effectiveDate,
    line.idempotencyKey,
  ]);
}

/** What `lines` add up to once written, one line per identity. */
function sumsOf(lines: readonly NewLedgerLine[]): LedgerSum[] {
  return lines.map(({ kind, allowanceRuleId, effectiveDate, amount }) => ({
    kind,
    allowanceRuleId,
    bankHolidayDate: kind === "bank_holiday_taken" ? effectiveDate : null,
    amount,
    lineCount: 1,
  }));
}
