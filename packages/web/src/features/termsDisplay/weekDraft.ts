import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { calendarDayParts } from "@/lib/calendarDay";

import { DAY_FIELDS, hoursOf, type WeekMinutes, weekSummary } from "./termsText";

/** The working week form: hours as typed, Monday first. */
export interface WeekDraft {
  hours: string[];
  calendar: BankHolidayCalendar;
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

/** Hours as typed, in steps of 15 minutes from 0 to 24, as minutes; null when not. */
function minutesOf(hours: string): number | null {
  const value = Number(hours.trim() === "" ? "0" : hours);
  const minutes = value * 60;
  return Number.isFinite(value) && value >= 0 && value <= 24 && Number.isInteger(minutes / 15)
    ? minutes
    : null;
}
