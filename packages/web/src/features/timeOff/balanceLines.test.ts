import { expect, it } from "vitest";

import { balanceLines } from "./timeOffText";

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

it.each([
  ["book", "0.5 days more than Sam has. You can still book it."],
  ["request", "0.5 days more than you have. You can still ask for it."],
] as const)("explains how to proceed beyond the balance in %s mode", (mode, over) => {
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
    mode,
  );

  expect(lines).toEqual([
    {
      label: null,
      before: 2,
      after: -0.5,
      over,
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
