import type { BankHolidayCalendar, TimeOffRulesInput } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayParts } from "@/lib/calendarDay";

import { daysError, rulesInputOf, type RulesValues, rulesValuesOf } from "../TimeOffSettings";
import {
  DAY_FIELDS,
  hoursOf,
  type PolicyVersionText,
  ruleSummary,
  shortDate,
  type WeekMinutes,
  weekSummary,
} from "./termsText";

/** The working week form: hours as typed, Monday first. */
export interface WeekDraft {
  hours: string[];
  calendar: BankHolidayCalendar;
  startDate: string;
}

/** A time off type's rules form; `offer` when the terms don't have the type yet. */
export interface RulesDraft extends RulesValues {
  offer: boolean;
  appliesFrom: "THIS_LEAVE_YEAR" | "NEXT_LEAVE_YEAR" | "ANOTHER_DATE";
  /** The date picked under "Another date". */
  otherDate: string;
}

/** A week version as the form starts from it. */
export type WeekVersion = WeekMinutes & { bankHolidayCalendar: BankHolidayCalendar };

/** The week form filled from today's version, applying from today. */
export function weekDraftOf(version: WeekVersion, today: string): WeekDraft {
  return {
    hours: DAY_FIELDS.map((field) => hoursOf(version[field])),
    calendar: version.bankHolidayCalendar,
    startDate: today,
  };
}

/**
 * The rules form filled from today's version, or from the type's default rules for an offer;
 * from this leave year's start.
 */
export function rulesDraftOf(
  version: PolicyVersionText | null,
  defaultRules: TimeOffRulesInput,
): RulesDraft {
  const rules = version
    ? { ...version, entitlementDays: version.yearlyEntitlement?.days ?? null }
    : defaultRules;
  return {
    offer: version === null,
    ...rulesValuesOf(rules),
    appliesFrom: "THIS_LEAVE_YEAR",
    otherDate: "",
  };
}

/** What is wrong with the week form, by field; empty when it can be saved. */
export function weekErrors(
  draft: WeekDraft,
  earliest: string,
): Partial<Record<"hours" | "startDate", string>> {
  const minutes = draft.hours.map(minutesOf);
  const errors: Partial<Record<"hours" | "startDate", string>> = {};
  if (minutes.some((value) => value === null)) {
    errors.hours = t("terms.edit.week.hoursInvalid");
  } else if (minutes.every((value) => value === 0)) {
    errors.hours = t("terms.edit.week.noWorkingDay");
  }
  if (!draft.startDate || draft.startDate < earliest) {
    errors.startDate = t("terms.edit.tooEarly", { date: shortDate(earliest) });
  }
  return errors;
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

/** The date the rules apply from: a leave year's start, or the date picked; "" while none is. */
export function rulesStartDate(draft: RulesDraft, earliest: string): string {
  switch (draft.appliesFrom) {
    case "THIS_LEAVE_YEAR":
      return earliest;
    case "NEXT_LEAVE_YEAR":
      return nextLeaveYear(earliest);
    case "ANOTHER_DATE":
      return draft.otherDate;
  }
}

/** The start of the leave year after the one starting on `start`. */
export function nextLeaveYear(start: string): string {
  return `${calendarDayParts(start)[0] + 1}${start.slice(4)}`;
}

/**
 * Whether how the type counts may change from the date picked: only at a leave year's start, and
 * always for an offer.
 * shortcut: every leave year starts on 1 January; read the version's leave year once they can differ.
 */
export function canChangeCounts(draft: RulesDraft, earliest: string): boolean {
  return draft.offer || rulesStartDate(draft, earliest).endsWith("-01-01");
}

/** What is wrong with the rules form, by field; empty when it can be saved. */
export function rulesErrors(
  draft: RulesDraft,
  earliest: string,
): Partial<Record<"days" | "startDate", string>> {
  const errors: Partial<Record<"days" | "startDate", string>> = {};
  const days = daysError(draft);
  if (days) {
    errors.days = days;
  }
  const startDate = rulesStartDate(draft, earliest);
  if (!startDate || startDate < earliest) {
    errors.startDate = t("terms.edit.tooEarly", { date: shortDate(earliest) });
  }
  return errors;
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

/** Whether the form only changes the days, keeping how the type counts and its bank holidays. */
export function changesOnlyDays(draft: RulesDraft, current: PolicyVersionText | null): boolean {
  const next = ruleTextOf(draft);
  return (
    current !== null &&
    current.balance === "BALANCE_FROM_ALLOWANCE" &&
    next.balance === current.balance &&
    next.bankHolidays === current.bankHolidays
  );
}

/** The box at the top of "What changes" for a section: the new value, and from when. */
export type ChangeBox = { title: string; detail: string | null };

/**
 * The box at the top of "What changes" for the week: the new week, and from when. `startDate` is
 * null when nobody was ever on the terms, so no date is named.
 */
export function weekChangeBox(draft: WeekDraft, startDate: string | null): ChangeBox {
  return {
    title: t("terms.edit.week.changeTitle", { week: weekSummary(weekOfDraft(draft)) }),
    detail: fromDate(startDate),
  };
}

/**
 * The box at the top of "What changes" for a type: "Annual leave: 20 → 22 days", and from when.
 * `startDate` is null when nobody was ever on the terms, so no date is named.
 */
export function rulesChangeBox(
  typeName: string,
  draft: RulesDraft,
  current: PolicyVersionText | null,
  startDate: string | null,
): ChangeBox {
  const rule = ruleSummary(ruleTextOf(draft));
  if (draft.offer || !current) {
    return {
      title: t("terms.edit.rules.offerTitle", { type: typeName, rule: upperFirst(rule) }),
      detail: fromDate(startDate),
    };
  }
  if (changesOnlyDays(draft, current)) {
    return {
      title: t("terms.edit.rules.daysTitle", {
        type: typeName,
        before: String(current.yearlyEntitlement?.days ?? 0),
        after: draft.days,
      }),
      detail: bankHolidaysStay(current, startDate),
    };
  }
  return {
    title: t("terms.edit.rules.ruleTitle", { type: typeName, rule: upperFirst(rule) }),
    detail: fromDate(startDate),
  };
}

/** "From 1 Jan 2027, bank holidays still on top", or without the date when there is none. */
function bankHolidaysStay(current: PolicyVersionText, startDate: string | null): string {
  const included = current.bankHolidays === "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE";
  if (startDate === null) {
    return t(included ? "terms.edit.rules.stillIncluded" : "terms.edit.rules.stillOnTop");
  }
  return t(included ? "terms.edit.rules.fromDateIncluded" : "terms.edit.rules.fromDateOnTop", {
    date: shortDate(startDate),
  });
}

/** "From 1 Dec 2026.", or null when there is no date. */
function fromDate(startDate: string | null): string | null {
  return startDate === null ? null : t("terms.edit.fromDate", { date: shortDate(startDate) });
}

/**
 * The footer's line while the week is open: who saving reaches, and from when. `startDate` is null
 * when nobody was ever on the terms, so no date is named.
 */
export function weekSaveLine(
  people: number | null,
  termsName: string,
  startDate: string | null,
): string {
  if (startDate === null) return t("terms.edit.week.saveLineNobodyEver", { terms: termsName });
  const date = longDate(startDate);
  if (people === 0) return t("terms.edit.week.saveLineNobody", { terms: termsName, date });
  return t("terms.edit.week.saveLine", { people: peopleText(people), terms: termsName, date });
}

/**
 * The footer's line while a type is open: who saving reaches, and from when. `startDate` is null
 * when nobody was ever on the terms, so no date is named.
 */
export function rulesSaveLine(
  offer: boolean,
  typeName: string,
  people: number | null,
  termsName: string,
  startDate: string | null,
): string {
  if (startDate === null) {
    return t(
      offer ? "terms.edit.rules.offerSaveLineNobodyEver" : "terms.edit.rules.saveLineNobodyEver",
      { type: typeName, terms: termsName },
    );
  }
  const values = {
    type: typeName,
    people: peopleText(people),
    terms: termsName,
    date: longDate(startDate),
  };
  return t(offer ? "terms.edit.rules.offerSaveLine" : "terms.edit.rules.saveLine", values);
}

/** The line under "Applies from": what the choice does to the leave year it falls in. */
export function appliesFromHint(draft: RulesDraft, earliest: string): string {
  const year = earliest.slice(0, 4);
  switch (draft.appliesFrom) {
    case "THIS_LEAVE_YEAR":
      return t(
        draft.offer ? "terms.edit.rules.offerThisYearHint" : "terms.edit.rules.thisYearHint",
        {
          year,
        },
      );
    case "NEXT_LEAVE_YEAR":
      return t(
        draft.offer ? "terms.edit.rules.offerNextYearHint" : "terms.edit.rules.nextYearHint",
        {
          year,
        },
      );
    case "ANOTHER_DATE":
      return t("terms.edit.rules.anotherDateHint", { year });
  }
}

/** The toast after saving: "Working week saved for Scotland. It changes on 1 Dec 2026." */
export function savedToast(what: string, termsName: string, startDate: string, today: string) {
  const saved = t("terms.edit.saved", { what, terms: termsName });
  return startDate > today
    ? `${saved} ${t("terms.edit.changesOn", { date: shortDate(startDate) })}`
    : saved;
}

/** "the 6 people", "the 1 person", or "people" while the count is loading. */
function peopleText(people: number | null): string {
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
