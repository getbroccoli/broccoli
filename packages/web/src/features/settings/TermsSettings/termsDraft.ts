import type { BankHolidayCalendar, TimeOffRulesInput } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayParts } from "@/lib/calendarDay";

import { daysError, rulesInputOf, type RulesValues, rulesValuesOf } from "../TimeOffSettings";
import {
  DAY_FIELDS,
  hoursOf,
  ruleSummary,
  type RuleText,
  shortDate,
  type WeekMinutes,
  weekSummary,
} from "@/features/termsDisplay";

/** The working week form: hours as typed, Monday first. */
export interface WeekDraft {
  hours: string[];
  calendar: BankHolidayCalendar;
}

/** A time off type's rules form; `offer` when the terms don't offer the type today. */
export interface RulesDraft extends RulesValues {
  offer: boolean;
}

/** A week as the form starts from it. */
export type WeekVersion = WeekMinutes & { bankHolidayCalendar: BankHolidayCalendar };

/** The week a form starts from on terms without one: Monday to Friday, 7.5 hours a day. */
export const DEFAULT_WEEK: WeekVersion = {
  mondayMinutes: 450,
  tuesdayMinutes: 450,
  wednesdayMinutes: 450,
  thursdayMinutes: 450,
  fridayMinutes: 450,
  saturdayMinutes: 0,
  sundayMinutes: 0,
  bankHolidayCalendar: "ENGLAND_AND_WALES",
};

/** The week form filled from a week: the unpublished one, else today's. */
export function weekDraftOf(version: WeekVersion): WeekDraft {
  return {
    hours: DAY_FIELDS.map((field) => hoursOf(version[field])),
    calendar: version.bankHolidayCalendar,
  };
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

/** What is wrong with the week form, by field; empty when it can be saved. */
export function weekErrors(draft: WeekDraft): Partial<Record<"hours", string>> {
  const minutes = draft.hours.map(minutesOf);
  if (minutes.some((value) => value === null)) {
    return { hours: t("terms.edit.week.hoursInvalid") };
  }
  if (minutes.every((value) => value === 0)) {
    return { hours: t("terms.edit.week.noWorkingDay") };
  }
  return {};
}

/** The week the form holds, as minutes; only for a form without errors. */
export function weekOfDraft(draft: WeekDraft): WeekMinutes {
  return Object.fromEntries(
    DAY_FIELDS.map((field, index) => [field, minutesOf(draft.hours[index]!) ?? 0]),
  ) as WeekMinutes;
}

/** The hint under the day fields: "32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours." */
export function weekHint(draft: WeekDraft, current: WeekMinutes): string {
  const week = weekOfDraft(draft);
  const minutes = DAY_FIELDS.map((field) => week[field]);
  return t("terms.edit.week.hint", {
    hours: hoursOf(minutes.reduce((sum, value) => sum + value, 0)),
    days: String(minutes.filter((value) => value > 0).length),
    was: weekSummary(current),
  });
}

/** The start of the leave year after the one starting on `start`. */
export function nextLeaveYear(start: string): string {
  return `${calendarDayParts(start)[0] + 1}${start.slice(4)}`;
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

/** Hours as typed, in steps of 15 minutes from 0 to 24, as minutes; null when not. */
function minutesOf(hours: string): number | null {
  const value = Number(hours.trim() === "" ? "0" : hours);
  const minutes = value * 60;
  return Number.isFinite(value) && value >= 0 && value <= 24 && Number.isInteger(minutes / 15)
    ? minutes
    : null;
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
