import { invalidInput } from "../../../core/applicationError";
import type { AllowanceRule } from "./allowanceCalculator";
import type { PolicyVersion } from "./timeOffPolicy";

/** The rules of a policy version before it is saved: no ids, no dates. */
export type NewPolicyVersion = Omit<PolicyVersion, "id" | "startDate" | "endDate" | "rules"> & {
  rules: DistributiveOmit<AllowanceRule, "id">[];
};

/** The standard leave policies' keys, most common first. */
export const STANDARD_LEAVE_POLICY_KEYS = [
  "uk_20_days_plus_bank_holidays",
  "uk_25_days_plus_bank_holidays",
  "uk_statutory_minimum",
] as const;
export type StandardLeavePolicyKey = (typeof STANDARD_LEAVE_POLICY_KEYS)[number];

/**
 * The Annual leave policies Broccoli ships, which setup copies into terms; each leave year starts
 * on 1 January.
 */
export const STANDARD_LEAVE_POLICIES: Record<
  StandardLeavePolicyKey,
  NewPolicyVersion & { name: string }
> = {
  uk_20_days_plus_bank_holidays: onTopOfBankHolidays("20 days plus bank holidays", 20),
  uk_25_days_plus_bank_holidays: onTopOfBankHolidays("25 days plus bank holidays", 25),
  // The 5.6 weeks of the Working Time Regulations 1998, capped at 28 days, may include bank holidays.
  uk_statutory_minimum: {
    name: "UK statutory minimum",
    ...fromAllowance("bank_holidays_included_in_allowance"),
    rules: [
      { kind: "yearly_entitlement", entitlementDays: 28, entitlementDaysPerWeek: 5, maxDays: 28 },
    ],
  },
};

/** The policy setup gives every type but Annual leave: time off is recorded, not counted. */
export const RECORD_ONLY_POLICY: NewPolicyVersion = {
  balance: "no_balance",
  bankHolidays: null,
  leaveYear: null,
  rules: [],
};

/** A standard leave policy's key sent in `annualLeavePolicyKey`; refuses any other. */
export function parseStandardLeavePolicyKey(value: string): StandardLeavePolicyKey {
  const key = STANDARD_LEAVE_POLICY_KEYS.find((known) => known === value);
  if (!key) {
    throw invalidInput([{ field: "annualLeavePolicyKey", code: "invalid" }]);
  }
  return key;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function onTopOfBankHolidays(name: string, entitlementDays: number) {
  return {
    name,
    ...fromAllowance("bank_holidays_on_top_of_allowance"),
    rules: [
      {
        kind: "yearly_entitlement" as const,
        entitlementDays,
        entitlementDaysPerWeek: 5,
        maxDays: null,
      },
    ],
  };
}

function fromAllowance(bankHolidays: NonNullable<PolicyVersion["bankHolidays"]>) {
  return {
    balance: "balance_from_allowance" as const,
    bankHolidays,
    leaveYear: { kind: "leave_year_from_fixed_date" as const, month: 1, day: 1 },
  };
}
