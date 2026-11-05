import { expect, it } from "vitest";

import { calendarDate } from "#test/support";

import { ledgerDifference } from "./ledgerDifference";

const allowance = {
  id: "allowance",
  leaveYearStart: calendarDate("2026-01-01"),
  leaveYearEnd: calendarDate("2026-12-31"),
};

it("a policy change corrects a grant from the leave year start", () => {
  const target = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "22",
      firstDate: calendarDate("2026-01-01"),
    },
  ] as const;
  const current = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "20",
      lineCount: 1,
      firstEffectiveDate: calendarDate("2026-01-01"),
    },
  ] as const;

  const lines = ledgerDifference(allowance, target, current, {
    kind: "POLICY_CHANGED",
    ref: "policy-1",
  });

  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({
    amount: "2",
    effectiveDate: "2026-01-01",
    causeKind: "policy_changed",
    causeRef: "policy-1",
  });
});

it("a policy change corrects a joiner's grant from their first contributing day", () => {
  const target = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "22",
      firstDate: calendarDate("2026-10-12"),
    },
  ] as const;
  const current = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "20",
      lineCount: 1,
      firstEffectiveDate: calendarDate("2026-01-01"),
    },
  ] as const;

  const lines = ledgerDifference(allowance, target, current, {
    kind: "POLICY_CHANGED",
    ref: "policy-1",
  });

  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ amount: "2", effectiveDate: "2026-10-12" });
});

it("a removed rule's grant is brought to zero", () => {
  const target = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-b",
      bankHolidayDate: null,
      amount: "22",
      firstDate: calendarDate("2026-01-01"),
    },
  ] as const;
  const current = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "20",
      lineCount: 1,
      firstEffectiveDate: calendarDate("2026-01-01"),
    },
  ] as const;

  const lines = ledgerDifference(allowance, target, current, {
    kind: "POLICY_CHANGED",
    ref: "policy-1",
  });

  expect(lines).toHaveLength(2);
  expect(lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ allowanceRuleId: "rule-a", amount: "-20" }),
      expect.objectContaining({ allowanceRuleId: "rule-b", amount: "22" }),
    ]),
  );
});

it("a removed rule's grant is reversed from the first contributing day", () => {
  const target = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-b",
      bankHolidayDate: null,
      amount: "4.88",
      firstDate: calendarDate("2026-10-12"),
    },
  ] as const;
  const current = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "4.44",
      lineCount: 1,
      firstEffectiveDate: calendarDate("2026-10-12"),
    },
  ] as const;

  const lines = ledgerDifference(allowance, target, current, {
    kind: "POLICY_CHANGED",
    ref: "policy-1",
  });

  expect(lines.find(({ allowanceRuleId }) => allowanceRuleId === "rule-a")).toMatchObject({
    amount: "-4.44",
    effectiveDate: "2026-10-12",
  });
});

it("a later policy's removed rule is reversed from when it first counted", () => {
  const target = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "10",
      firstDate: calendarDate("2026-01-01"),
    },
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-b-new",
      bankHolidayDate: null,
      amount: "13.6",
      firstDate: calendarDate("2026-07-01"),
    },
  ] as const;
  const current = [
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-a",
      bankHolidayDate: null,
      amount: "10",
      lineCount: 1,
      firstEffectiveDate: calendarDate("2026-01-01"),
    },
    {
      kind: "entitlement_grant",
      allowanceRuleId: "rule-b-old",
      bankHolidayDate: null,
      amount: "12.6",
      lineCount: 1,
      firstEffectiveDate: calendarDate("2026-07-01"),
    },
  ] as const;

  const lines = ledgerDifference(allowance, target, current, {
    kind: "POLICY_CHANGED",
    ref: "policy-b",
  });

  expect(lines.find(({ allowanceRuleId }) => allowanceRuleId === "rule-b-old")).toMatchObject({
    amount: "-12.6",
    effectiveDate: "2026-07-01",
  });
});
