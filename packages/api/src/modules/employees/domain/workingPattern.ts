import { invalidInput } from "../../../core/applicationError";
import { type CalendarDate, parseCalendarDate } from "../../../utils";
import type { BankHolidayCalendar } from "../../bankHolidays";

/** Minutes worked on each weekday, Monday to Sunday; 0 is not working. */
export type WeekdayMinutes = readonly [number, number, number, number, number, number, number];

/** A pattern's minutes from a date until its next week starts; null from the beginning. */
export interface PatternWeek {
  effectiveFrom: CalendarDate | null;
  minutes: WeekdayMinutes;
  /** The minutes one day of leave stands for. */
  fullDayMinutes: number;
  bankHolidayCalendar: BankHolidayCalendar;
}

/** A named way of working that groups and people are put on. */
export interface WorkingPattern {
  id: string;
  name: string;
  /** The seeded Standard pattern, which cannot be deleted. */
  isStandard: boolean;
  /** Oldest first; the first starts from the beginning. */
  weeks: PatternWeek[];
}

/**
 * What a person works from a date until the next working week starts, and whose bank holidays
 * apply; all null while they have no working pattern.
 */
export interface WorkingWeek {
  effectiveFrom: CalendarDate;
  minutes: WeekdayMinutes | null;
  fullDayMinutes: number | null;
  bankHolidayCalendar: BankHolidayCalendar | null;
}

/** The name a pattern is saved under; refuses a blank one. */
export function parsePatternName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw invalidInput([{ field: "name", code: "required" }]);
  }
  return trimmed;
}

/**
 * Minutes on each weekday and a full day as they are stored: whole minutes in a day, at least one
 * working day, and a full day no shorter than the longest one.
 */
export function parseWeek(week: { minutes: readonly number[]; fullDayMinutes: number }): {
  minutes: WeekdayMinutes;
  fullDayMinutes: number;
} {
  const { minutes, fullDayMinutes } = week;
  if (minutes.length !== 7 || !minutes.every((day) => isMinutesInADay(day, 0))) {
    throw invalidInput([{ field: "minutes", code: "out_of_range" }]);
  }
  if (minutes.every((day) => day === 0)) {
    throw invalidInput([{ field: "minutes", code: "no_working_day" }]);
  }
  if (!isMinutesInADay(fullDayMinutes, 1)) {
    throw invalidInput([{ field: "fullDayMinutes", code: "out_of_range" }]);
  }
  if (fullDayMinutes < Math.max(...minutes)) {
    throw invalidInput([{ field: "fullDayMinutes", code: "shorter_than_longest_day" }]);
  }
  return { minutes: [...minutes] as unknown as WeekdayMinutes, fullDayMinutes };
}

/** A `YYYY-MM-DD` date sent in `field`; refuses anything else. */
export function parseDateField(field: string, value: string): CalendarDate {
  const date = parseCalendarDate(value);
  if (!date) {
    throw invalidInput([{ field, code: "invalid" }]);
  }
  return date;
}

function isMinutesInADay(value: number, least: number): boolean {
  return Number.isInteger(value) && value >= least && value <= MINUTES_IN_A_DAY;
}

const MINUTES_IN_A_DAY = 1440;
