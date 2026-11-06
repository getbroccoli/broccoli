import { invalidInput } from "../../../core/applicationError";
import type { CalendarDate } from "../../../utils";
import type { NewPolicyVersion } from "./standardLeavePolicies";
import type { PolicyVersion } from "./timeOffPolicy";

/** How a type counts, as one version sets it: what an admin picks in Settings. */
export interface TimeOffRules {
  balance: PolicyVersion["balance"];
  /** Days a year for a 5-day week; null unless the balance is from an allowance. */
  entitlementDays: number | null;
  /** Null unless the balance is from an allowance. */
  bankHolidays: PolicyVersion["bankHolidays"];
}

/** What the rules may come in as. */
export interface TimeOffRulesInput {
  balance: string;
  entitlementDays?: number | null;
  bankHolidays?: string | null;
}

/** The rules as stored; refuses an unknown balance, days out of range, or missing bank holidays. */
export function parseRules(input: TimeOffRulesInput): TimeOffRules {
  if (!BALANCES.includes(input.balance as TimeOffRules["balance"])) {
    throw invalidInput([{ field: "rules.balance", code: "invalid" }]);
  }
  const balance = input.balance as TimeOffRules["balance"];
  if (balance !== "balance_from_allowance") {
    return { balance, entitlementDays: null, bankHolidays: null };
  }
  const days = input.entitlementDays;
  if (days == null || days < 0 || days > MAX_DAYS || !Number.isInteger(days * 2)) {
    throw invalidInput([{ field: "rules.entitlementDays", code: "out_of_range" }]);
  }
  if (!BANK_HOLIDAYS.includes(input.bankHolidays as never)) {
    throw invalidInput([{ field: "rules.bankHolidays", code: "required" }]);
  }
  return {
    balance,
    entitlementDays: days,
    bankHolidays: input.bankHolidays as TimeOffRules["bankHolidays"],
  };
}

/**
 * Refuses a change of how a type counts from `startDate` unless a leave year starts then; an offer
 * has no version before it, so it may count any way.
 * shortcut: every leave year starts on 1 January; take the version's own leave year once they can differ.
 */
export function refuseCountsChangeMidYear(
  before: PolicyVersion | null,
  rules: TimeOffRules,
  startDate: CalendarDate,
) {
  if (before && before.balance !== rules.balance && !startDate.endsWith("-01-01")) {
    throw invalidInput([{ field: "rules.balance", code: "not_leave_year_start" }]);
  }
}

/**
 * The version the rules make, keeping what the form does not show from `before`: its leave year,
 * days per week and service steps, and its most days while the new days stay at or under it.
 */
export function versionFromRules(
  rules: TimeOffRules,
  before: PolicyVersion | null,
): NewPolicyVersion {
  if (rules.balance === "no_balance") {
    return { ...rules, leaveYear: null, rules: [] };
  }
  const leaveYear = before?.leaveYear ?? FROM_1_JANUARY;
  if (rules.balance === "unlimited_balance") {
    return { balance: rules.balance, bankHolidays: null, leaveYear, rules: [] };
  }
  const yearly = before?.rules.find((rule) => rule.kind === "yearly_entitlement");
  const entitlementDays = rules.entitlementDays!;
  const maxDays =
    yearly?.maxDays != null && entitlementDays <= yearly.maxDays ? yearly.maxDays : null;
  const serviceSteps = (before?.rules ?? []).flatMap((rule) =>
    rule.kind === "service_extra"
      ? [{ kind: rule.kind, afterYears: rule.afterYears, extraDays: rule.extraDays }]
      : [],
  );
  return {
    balance: rules.balance,
    bankHolidays: rules.bankHolidays,
    leaveYear,
    rules: [
      {
        kind: "yearly_entitlement",
        entitlementDays,
        entitlementDaysPerWeek: yearly?.entitlementDaysPerWeek ?? 5,
        maxDays,
      },
      ...serviceSteps,
    ],
  };
}

/** A version's rules as history keeps them: a JSON object with its start date. */
export function rulesValue(
  version: Pick<PolicyVersion, "startDate" | "balance" | "bankHolidays"> & {
    rules: NewPolicyVersion["rules"];
  },
): string {
  const yearly = version.rules.find((rule) => rule.kind === "yearly_entitlement");
  return JSON.stringify({
    startDate: version.startDate,
    balance: version.balance,
    entitlementDays: yearly?.entitlementDays ?? null,
    bankHolidays: version.bankHolidays,
  });
}

const BALANCES: readonly TimeOffRules["balance"][] = [
  "balance_from_allowance",
  "unlimited_balance",
  "no_balance",
];

const BANK_HOLIDAYS = [
  "bank_holidays_on_top_of_allowance",
  "bank_holidays_included_in_allowance",
] as const;

/** The most days a year an allowance may grant: one for every day of a leap year. */
const MAX_DAYS = 366;

const FROM_1_JANUARY = { kind: "leave_year_from_fixed_date", month: 1, day: 1 } as const;
