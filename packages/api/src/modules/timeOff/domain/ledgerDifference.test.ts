import { expect, it } from "vitest";

import { allowanceInputs, calendarDate } from "#test/support";

import { calculateAllowance } from "./allowanceCalculator";
import { type LedgerSum, ledgerDifference, type NewLedgerLine } from "./ledgerDifference";

const allowance = {
  id: "allowance",
  leaveYearStart: calendarDate("2026-01-01"),
  leaveYearEnd: calendarDate("2026-12-31"),
};
const linked = { kind: "POLICY_LINKED_TO_TERMS", ref: "terms" } as const;

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
      ({ causeKind, causeRef }) => causeKind === "policy_linked_to_terms" && causeRef === "terms",
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

it.each([
  { previousStartDate: null, startDate: calendarDate("2026-07-01") },
  { previousStartDate: calendarDate("2026-07-01"), startDate: null },
])(
  "dates a correction between $previousStartDate and $startDate from the year start",
  ({ previousStartDate, startDate }) => {
    const inputs = allowanceInputs();
    inputs.employments = [{ startDate: previousStartDate, endDate: null }];
    inputs.serviceStart = previousStartDate;
    const previous = calculateAllowance(inputs);
    const before = ledgerDifference(allowance, previous, [], linked);
    inputs.employments = [{ startDate, endDate: null }];
    inputs.serviceStart = startDate;

    const lines = ledgerDifference(
      allowance,
      calculateAllowance(inputs),
      sumsOf(before),
      { kind: "START_DATE_CHANGED", ref: startDate, previousStartDate },
      previous,
    );

    expect(lines.find(({ kind }) => kind === "entitlement_grant")).toMatchObject({
      effectiveDate: "2026-01-01",
    });
  },
);

it.each([
  { from: "2021-10-01", to: "2021-07-01", amount: "0.756165" },
  { from: "2021-07-01", to: "2021-10-01", amount: "-0.756165" },
  { from: "2022-01-01", to: "2021-07-01", amount: "1.512329" },
  { from: "2021-07-01", to: "2022-01-01", amount: "-1.512329" },
])(
  "dates a service grant corrected from $from to $to from the earliest changed anniversary",
  ({ from, to, amount }) => {
    const inputs = allowanceInputs();
    inputs.policies = inputs.policies.map((policy) => ({
      ...policy,
      rules: [
        ...policy.rules,
        { id: "five-years", kind: "service_extra", afterYears: 5, extraDays: 3 },
      ],
    }));
    const previousStartDate = calendarDate(from);
    inputs.employments = [{ startDate: previousStartDate, endDate: null }];
    inputs.serviceStart = previousStartDate;
    const previous = calculateAllowance(inputs);
    const before = ledgerDifference(allowance, previous, [], linked);
    const startDate = calendarDate(to);
    inputs.employments = [{ startDate, endDate: null }];
    inputs.serviceStart = startDate;

    const lines = ledgerDifference(
      allowance,
      calculateAllowance(inputs),
      sumsOf(before),
      { kind: "START_DATE_CHANGED", ref: startDate, previousStartDate },
      previous,
    );

    expect(lines.find(({ allowanceRuleId }) => allowanceRuleId === "five-years")).toMatchObject({
      amount,
      effectiveDate: "2026-07-01",
    });
    expect(lines.find(({ kind }) => kind === "rounding_up_to_half_day")).toMatchObject({
      effectiveDate: "2026-07-01",
    });
  },
);

it("clamps a correction after the leave year to its final day", () => {
  const before = ledgerDifference(allowance, calculateAllowance(allowanceInputs()), [], linked);

  const lines = ledgerDifference(allowance, [], sumsOf(before), {
    kind: "WORKING_PATTERN_CHANGED",
    ref: "2027-02-01",
  });

  expect(lines.find(({ kind }) => kind === "entitlement_grant")).toMatchObject({
    amount: "-28",
    effectiveDate: "2026-12-31",
  });
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
    firstEffectiveDate: effectiveDate,
  }));
}
