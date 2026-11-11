import type { TimeOffRulesInput } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayParts } from "@/lib/calendarDay";

import { daysError, rulesInputOf, type RulesValues, rulesValuesOf } from "../TimeOffSettings";
import {
  ruleSummary,
  type RuleText,
  shortDate,
  type WeekMinutes,
  weekSummary,
} from "@/features/termsDisplay";

/** A time off type's rules form; `offer` when the terms don't offer the type today. */
export interface RulesDraft extends RulesValues {
  offer: boolean;
}

/**
 * The rules form filled from rules, the unpublished ones else today's, or from the type's default
 * rules; `offer` while the terms don't offer the type today.
 */
export function rulesDraftOf(
  version: RuleText | null,
  defaultRules: TimeOffRulesInput,
  offer: boolean,
): RulesDraft {
  const rules = version
    ? { ...version, entitlementDays: version.yearlyEntitlement?.days ?? null }
    : defaultRules;
  return { offer, ...rulesValuesOf(rules) };
}

/** What is wrong with the rules form, by field; empty when it can be saved. */
export function rulesErrors(draft: RulesDraft): Partial<Record<"days", string>> {
  const days = daysError(draft);
  return days ? { days } : {};
}

/** The rules the form holds as a version, for the lines that describe it. */
export function ruleTextOf(draft: RulesDraft) {
  const input = rulesInputOf(draft);
  return {
    balance: input.balance,
    bankHolidays: input.bankHolidays,
    yearlyEntitlement:
      input.entitlementDays === null ? null : { days: input.entitlementDays, daysPerWeek: 5 },
  };
}

/** Whether `next` only changes the days, keeping how the type counts and its bank holidays. */
export function changesOnlyDays(next: RuleText, current: RuleText | null): boolean {
  return (
    current !== null &&
    current.balance === "BALANCE_FROM_ALLOWANCE" &&
    next.balance === current.balance &&
    next.bankHolidays === current.bankHolidays
  );
}

/** A box in "What changes": the new value, and from when. */
export type ChangeBox = { title: string; detail: string };

/** The box in "What changes" for a stop: "Family leave: not offered", and from when. */
export function stopChangeBox(typeName: string, startDate: string): ChangeBox {
  return { title: t("terms.edit.stop.change", { type: typeName }), detail: fromDate(startDate) };
}

/** The box in "What changes" for the week: the new week, and from when. */
export function weekChangeBox(week: WeekMinutes, startDate: string): ChangeBox {
  return {
    title: t("terms.edit.week.changeTitle", { week: weekSummary(week) }),
    detail: fromDate(startDate),
  };
}

/** The box in "What changes" for a type: "Annual leave: 20 → 22 days", and from when. */
export function rulesChangeBox(
  typeName: string,
  next: RuleText,
  current: RuleText | null,
  startDate: string,
): ChangeBox {
  const rule = ruleSummary(next);
  if (!current) {
    return {
      title: t("terms.edit.rules.offerTitle", { type: typeName, rule: upperFirst(rule) }),
      detail: fromDate(startDate),
    };
  }
  if (changesOnlyDays(next, current)) {
    return {
      title: t("terms.edit.rules.daysTitle", {
        type: typeName,
        before: String(current.yearlyEntitlement?.days ?? 0),
        after: String(next.yearlyEntitlement?.days ?? 0),
      }),
      detail: bankHolidaysStay(current, startDate),
    };
  }
  return {
    title: t("terms.edit.rules.ruleTitle", { type: typeName, rule: upperFirst(rule) }),
    detail: fromDate(startDate),
  };
}

/** "the 6 people", "the 1 person", or "people" while the count is loading. */
export function peopleText(people: number | null): string {
  if (people === null) return t("terms.edit.peopleLoading");
  return people === 1
    ? t("terms.edit.onePerson")
    : t("terms.edit.people", { count: String(people) });
}

/** "From 1 Jan 2027, bank holidays still on top". */
function bankHolidaysStay(current: RuleText, startDate: string): string {
  const included = current.bankHolidays === "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE";
  return t(included ? "terms.edit.rules.fromDateIncluded" : "terms.edit.rules.fromDateOnTop", {
    date: shortDate(startDate),
  });
}

/** "From 1 Dec 2026." */
function fromDate(startDate: string): string {
  return t("terms.edit.fromDate", { date: shortDate(startDate) });
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A `YYYY-MM-DD` day as "1 December 2026". */
export function longDate(value: string): string {
  return LONG_DATE.format(Date.UTC(...calendarDayParts(value)));
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
