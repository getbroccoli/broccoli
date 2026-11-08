import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { calendarName } from "./calendarName";
import {
  DAY_FIELDS,
  ruleSummary,
  type RuleText,
  shortDate,
  type WeekMinutes,
  weekSummary,
} from "./termsText";

/**
 * A change to the terms' working week or a type's rules as the words after its author: "changed
 * Annual leave to 22 days a year, bank holidays on top, from 1 Jan 2027"; null for other fields.
 */
export function termsChangeSentence({
  field,
  oldValue,
  newValue,
  newLabel,
}: {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  newLabel?: string | null;
}): string | null {
  if (field === "workingWeek") {
    const week = parseValue<WeekValue>(newValue);
    const cancelled = parseValue<WeekValue>(oldValue);
    if (week) {
      return t("terms.history.weekChanged", { week: weekText(week), date: dateOf(week) });
    }
    return cancelled && t("terms.history.weekCancelled", { date: dateOf(cancelled) });
  }
  if (field.startsWith("timeOff.")) {
    const type = newLabel ?? "";
    const rules = parseValue<RulesValue>(newValue);
    const before = parseValue<RulesValue>(oldValue);
    if (!rules) {
      return before && t("terms.history.rulesCancelled", { type, date: dateOf(before) });
    }
    const rule = ruleSummary(ruleTextOf(rules));
    return before
      ? t("terms.history.rulesChanged", { type, rule: lowerFirst(rule), date: dateOf(rules) })
      : t("terms.history.offered", { type, rule: upperFirst(rule), date: dateOf(rules) });
  }
  return null;
}

/** A working week as the history keeps it. */
interface WeekValue {
  startDate: string | null;
  minutes: number[];
  bankHolidayCalendar: string;
}

/** A type's rules as the history keeps them; enum values in lower case. */
interface RulesValue {
  startDate: string | null;
  balance: string;
  entitlementDays: number | null;
  bankHolidays: string | null;
}

function parseValue<V>(value: string | null): V | null {
  return value === null ? null : (JSON.parse(value) as V);
}

function weekText({ minutes, bankHolidayCalendar }: WeekValue): string {
  const week = Object.fromEntries(
    DAY_FIELDS.map((field, index) => [field, minutes[index] ?? 0]),
  ) as WeekMinutes;
  const calendar = bankHolidayCalendar.toUpperCase() as BankHolidayCalendar;
  return `${weekSummary(week)}, ${t("terms.bankHolidays", { calendar: calendarName(calendar) })}`;
}

function ruleTextOf({ balance, entitlementDays, bankHolidays }: RulesValue): RuleText {
  return {
    balance: balance.toUpperCase() as RuleText["balance"],
    bankHolidays: bankHolidays?.toUpperCase() as RuleText["bankHolidays"],
    yearlyEntitlement: entitlementDays === null ? null : { days: entitlementDays, daysPerWeek: 5 },
  };
}

function dateOf({ startDate }: { startDate: string | null }): string {
  return startDate ? shortDate(startDate) : "";
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
