import type { TimeOffBalanceKind, TimeOffRulesInput } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** How a type counts as a form holds it: the days as typed. */
export interface RulesValues {
  balance: TimeOffBalanceKind;
  days: string;
  onTop: boolean;
}

/** The form filled from rules: no days as empty, bank holidays on top unless included. */
export function rulesValuesOf(rules: TimeOffRulesInput): RulesValues {
  return {
    balance: rules.balance,
    days: rules.entitlementDays == null ? "" : String(rules.entitlementDays),
    onTop: rules.bankHolidays !== "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE",
  };
}

/** The rules the form holds, as the API takes them. */
export function rulesInputOf(values: RulesValues) {
  const fromAllowance = values.balance === "BALANCE_FROM_ALLOWANCE";
  return {
    balance: values.balance,
    entitlementDays: fromAllowance ? Number(values.days) : null,
    bankHolidays: fromAllowance
      ? values.onTop
        ? ("BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE" as const)
        : ("BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE" as const)
      : null,
  };
}

/** What is wrong with the days: 0 to 366 in half days, required for an allowance. */
export function daysError(values: RulesValues): string | undefined {
  if (values.balance !== "BALANCE_FROM_ALLOWANCE") return undefined;
  const days = Number(values.days);
  const valid = values.days.trim() !== "" && Number.isInteger(days * 2) && days >= 0 && days <= 366;
  return valid ? undefined : t("terms.edit.rules.daysInvalid");
}
