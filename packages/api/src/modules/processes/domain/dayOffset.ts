import { ApplicationError } from "../../../core/applicationError";
import { addDays, type CalendarDate, weekdayOf } from "../../../utils";
import type { DayOffset } from "./processDefinition";

/** Whether a person works on a date: a day of their working week that is not a bank holiday. */
export type IsWorkingDay = (date: CalendarDate) => boolean;

/**
 * The date `offset` away from `from`. Business days count only working days, so +n is the n-th
 * working day after `from` and 0 is `from` itself; without `isWorkingDay` they count as calendar days.
 */
export function addDayOffset(
  from: CalendarDate,
  { amount, unit }: DayOffset,
  isWorkingDay: IsWorkingDay | null,
): CalendarDate {
  if (unit === "calendar_days" || isWorkingDay === null) {
    return addDays(from, amount);
  }
  const step = Math.sign(amount);
  let date = from;
  for (let left = Math.abs(amount), searched = 0; left > 0; searched += 1) {
    if (searched === MAX_SEARCH_DAYS) {
      throw new ApplicationError(
        "CONFLICT",
        `No working day comes within ${MAX_SEARCH_DAYS} days.`,
      );
    }
    date = addDays(date, step);
    if (isWorkingDay(date)) left -= 1;
  }
  return date;
}

/** One stretch of a person's working week, as employees reads it: minutes Monday first. */
export interface DatedWeek {
  startDate: CalendarDate;
  minutes: readonly number[] | null;
}

/**
 * Working days under the weeks in force on each date (oldest first) less `isBankHoliday`; null for a
 * person with no working week at all. A date with no week in force counts, as calendar days do.
 */
export function workingDaysOf(
  weeks: readonly DatedWeek[],
  isBankHoliday: (date: CalendarDate, weekIndex: number) => boolean,
): IsWorkingDay | null {
  if (!weeks.some(({ minutes }) => minutes !== null)) return null;
  return (date) => {
    const weekIndex = weeks.findLastIndex(({ startDate }) => startDate <= date);
    const minutes = weeks[weekIndex]?.minutes;
    if (!minutes) return true;
    return minutes[weekdayOf(date)]! > 0 && !isBankHoliday(date, weekIndex);
  };
}

/** Past the largest business offset (260) with every holiday and part-time week: a longer search finds none. */
export const MAX_SEARCH_DAYS = 1000;
