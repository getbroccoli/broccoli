import { expect, it } from "vitest";

import { parseRules, versionFromRules, type TimeOffRules } from "./policyChange";
import type { PolicyVersion } from "./timeOffPolicy";

it.each([367, 20.3, -1, null, undefined])(
  "refuses invalid entitlement days %s",
  (entitlementDays) => {
    expect(() =>
      parseRules({
        balance: "balance_from_allowance",
        entitlementDays,
        bankHolidays: "bank_holidays_on_top_of_allowance",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_INPUT",
        fieldErrors: [{ field: "rules.entitlementDays", code: "out_of_range" }],
      }),
    );
  },
);

it("requires a bank holiday choice for a balance from an allowance", () => {
  expect(() => parseRules({ balance: "balance_from_allowance", entitlementDays: 22 })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "rules.bankHolidays", code: "required" }],
    }),
  );
});

it("drops entitlement days and bank holidays when parsing unlimited rules", () => {
  const parsed = parseRules({
    balance: "unlimited_balance",
    entitlementDays: 22,
    bankHolidays: "bank_holidays_on_top_of_allowance",
  });

  expect(parsed).toEqual({
    balance: "unlimited_balance",
    entitlementDays: null,
    bankHolidays: null,
  });
});

it.each([22, 28])("keeps the yearly cap when the new entitlement is %s days", (entitlementDays) => {
  const version = versionFromRules({ ...rules, entitlementDays }, current);

  expect(version.rules[0]).toEqual({
    kind: "yearly_entitlement",
    entitlementDays,
    entitlementDaysPerWeek: 5,
    maxDays: 28,
  });
});

it("drops the yearly cap when the new entitlement exceeds it", () => {
  const version = versionFromRules({ ...rules, entitlementDays: 29 }, current);

  expect(version.rules[0]).toEqual({
    kind: "yearly_entitlement",
    entitlementDays: 29,
    entitlementDaysPerWeek: 5,
    maxDays: null,
  });
});

it("keeps service steps when changing the yearly entitlement", () => {
  const version = versionFromRules(rules, current);

  expect(version.rules).toEqual([
    { kind: "yearly_entitlement", entitlementDays: 22, entitlementDaysPerWeek: 5, maxDays: 28 },
    { kind: "service_extra", afterYears: 2, extraDays: 1 },
    { kind: "service_extra", afterYears: 5, extraDays: 2 },
  ]);
});

it("keeps the current leave year when changing the yearly entitlement", () => {
  const version = versionFromRules(rules, current);

  expect(version.leaveYear).toEqual({ kind: "leave_year_from_employee_start_date" });
});

it("removes allowance rules and keeps the leave year when changing to unlimited leave", () => {
  const version = versionFromRules(
    { balance: "unlimited_balance", entitlementDays: null, bankHolidays: null },
    current,
  );

  expect(version).toMatchObject({
    balance: "unlimited_balance",
    bankHolidays: null,
    leaveYear: { kind: "leave_year_from_employee_start_date" },
    rules: [],
  });
});

it("removes allowance rules and the leave year when changing to recorded leave", () => {
  const version = versionFromRules(
    { balance: "no_balance", entitlementDays: null, bankHolidays: null },
    current,
  );

  expect(version).toMatchObject({
    balance: "no_balance",
    bankHolidays: null,
    leaveYear: null,
    rules: [],
  });
});

const rules: TimeOffRules = {
  balance: "balance_from_allowance",
  entitlementDays: 22,
  bankHolidays: "bank_holidays_on_top_of_allowance",
};

const current: PolicyVersion = {
  id: "current",
  startDate: null,
  endDate: null,
  balance: "balance_from_allowance",
  bankHolidays: "bank_holidays_included_in_allowance",
  leaveYear: { kind: "leave_year_from_employee_start_date" },
  rules: [
    {
      id: "yearly",
      kind: "yearly_entitlement",
      entitlementDays: 28,
      entitlementDaysPerWeek: 5,
      maxDays: 28,
    },
    { id: "two-years", kind: "service_extra", afterYears: 2, extraDays: 1 },
    { id: "five-years", kind: "service_extra", afterYears: 5, extraDays: 2 },
  ],
};
