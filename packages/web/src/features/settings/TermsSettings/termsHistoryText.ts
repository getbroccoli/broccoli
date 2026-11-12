import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";
import {
  calendarName,
  DAY_FIELDS,
  DAY_NAMES,
  hoursOf,
  ruleSummary,
  shortDate,
  storedRuleText,
  type WeekMinutes,
  weekSummary,
} from "@/features/termsDisplay";

/**
 * A change to the terms' working week or a type's rules as the words after its author, naming only
 * what changed, and its date unless it applies from the day it was made: "changed Thu to 8 hours", "changed
 * Annual leave to 22 days a year from 1 Jan 2027"; null for other fields.
 */
export function termsChangeSentence(
  {
    field,
    oldValue,
    newValue,
    newLabel,
  }: {
    field: string;
    oldValue: string | null;
    newValue: string | null;
    newLabel?: string | null;
  },
  madeOn: string,
): string | null {
  if (field === "workingWeek") {
    const week = parseValue<WeekValue>(newValue);
    const before = parseValue<WeekValue>(oldValue);
    if (!week) {
      return before && t("terms.history.weekCancelled", { date: dateOf(before) });
    }
    return dated(weekChange(week, before), week, madeOn);
  }
  if (field.startsWith("timeOff.")) {
    const type = newLabel ?? "";
    const stop = stopSentence(type, oldValue, newValue, madeOn);
    if (stop) return stop;
    const rules = parseValue<RulesValue>(newValue);
    const before = parseValue<RulesValue>(oldValue);
    if (!rules) {
      return before && t("terms.history.rulesCancelled", { type, date: dateOf(before) });
    }
    const rule = ruleSummary(storedRuleText(rules));
    if (!before) {
      return startsOtherDay(rules, madeOn)
        ? t("terms.history.offeredFrom", { type, rule: upperFirst(rule), date: dateOf(rules) })
        : t("terms.history.offered", { type, rule: upperFirst(rule) });
    }
    const change = onlyDaysChanged(before, rules)
      ? t("terms.history.daysChanged", { type, days: String(rules.entitlementDays) })
      : t("terms.history.rulesChanged", { type, rule: lowerFirst(rule) });
    return dated(change, rules, madeOn);
  }
  return null;
}

/** "changed Thu and Fri to 8 hours", "changed bank holidays to Scotland", or the whole new week. */
function weekChange(week: WeekValue, before: WeekValue | null): string {
  const calendarChanged = before?.bankHolidayCalendar !== week.bankHolidayCalendar;
  const days = before
    ? week.minutes.flatMap((minutes, day) => (minutes === before.minutes[day] ? [] : [day]))
    : [];
  if (before && days.length === 0 && calendarChanged) {
    return t("terms.history.bankHolidaysChanged", { calendar: calendarOf(week) });
  }
  const sameHours = new Set(days.map((day) => week.minutes[day])).size === 1;
  if (!calendarChanged && sameHours) {
    const minutes = week.minutes[days[0]!]!;
    const names = dayList(days);
    if (minutes > 0) return t("terms.history.daysHours", { days: names, hours: hoursOf(minutes) });
    return t(days.length === 1 ? "terms.history.dayOff" : "terms.history.daysOff", { days: names });
  }
  const summary = weekSummary(weekMinutesOf(week));
  return t("terms.history.weekChanged", {
    week: calendarChanged
      ? `${summary}, ${t("terms.bankHolidays", { calendar: calendarOf(week) })}`
      : summary,
  });
}

/** The change with " from <date>" when it applies from another day than the one it was made. */
function dated(change: string, { startDate }: { startDate: string | null }, madeOn: string) {
  return startDate && startsOtherDay({ startDate }, madeOn)
    ? t("terms.history.from", { change, date: shortDate(startDate) })
    : change;
}

function startsOtherDay({ startDate }: { startDate: string | null }, madeOn: string): boolean {
  return startDate !== null && startDate !== madeOn;
}

function onlyDaysChanged(before: RulesValue, rules: RulesValue): boolean {
  return (
    rules.balance === "balance_from_allowance" &&
    before.balance === rules.balance &&
    before.bankHolidays === rules.bankHolidays
  );
}

/** "Thu", "Thu and Fri", "Mon, Thu and Fri". */
function dayList(days: number[]): string {
  const names = days.map((day) => t(DAY_NAMES[day]!));
  return names.length === 1
    ? names[0]!
    : t("terms.history.dayList", { days: names.slice(0, -1).join(", "), last: names.at(-1)! });
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

/** A stop as history keeps it: the first day the type is not offered. */
type StopValue = { stopDate: string } | RulesValue;

/** "stopped offering Family leave from 1 Jan 2027", or its cancel; null for a change of rules. */
function stopSentence(
  type: string,
  oldValue: string | null,
  newValue: string | null,
  madeOn: string,
): string | null {
  const stop = parseValue<StopValue>(newValue);
  if (stop && "stopDate" in stop) {
    return stop.stopDate === madeOn
      ? t("terms.history.stopped", { type })
      : t("terms.history.stoppedFrom", { type, date: shortDate(stop.stopDate) });
  }
  const before = parseValue<StopValue>(oldValue);
  return before && "stopDate" in before
    ? t("terms.history.stopCancelled", { type, date: shortDate(before.stopDate) })
    : null;
}

function parseValue<V>(value: string | null): V | null {
  return value === null ? null : (JSON.parse(value) as V);
}

function weekMinutesOf({ minutes }: WeekValue): WeekMinutes {
  return Object.fromEntries(
    DAY_FIELDS.map((field, index) => [field, minutes[index] ?? 0]),
  ) as WeekMinutes;
}

function calendarOf({ bankHolidayCalendar }: WeekValue): string {
  return calendarName(bankHolidayCalendar.toUpperCase() as BankHolidayCalendar);
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
