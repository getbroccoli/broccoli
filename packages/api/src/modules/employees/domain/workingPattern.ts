import { invalidInput } from "../../../core/applicationError";
import {
  type CalendarDate,
  type CalendarDateRange,
  coversDate,
  parseCalendarDate,
} from "../../../utils";
import type { BankHolidayCalendar } from "../../bankHolidays";

/** Minutes worked on each weekday, Monday to Sunday; 0 is not working. */
export type WeekdayMinutes = readonly [number, number, number, number, number, number, number];

/** A pattern's minutes from a date to a date; never edited, only ended. */
export interface PatternVersion extends CalendarDateRange {
  id: string;
  minutes: WeekdayMinutes;
  bankHolidayCalendar: BankHolidayCalendar;
}

/** A pattern's minutes and bank holidays: what a version holds besides its dates. */
export type PatternWeek = Omit<PatternVersion, "id" | "startDate" | "endDate">;

/** A way of working: one set of terms' own, or a named one people are put on one by one. */
export interface WorkingPattern {
  id: string;
  /** Null: a named pattern for one person at a time. */
  termsId: string | null;
  /** Null on a terms' pattern. */
  name: string | null;
  /** Oldest first; the first starts from the beginning. */
  versions: PatternVersion[];
}

/**
 * What a person works from a date until the next working week starts, and whose bank holidays
 * apply; all null while they have no working pattern.
 */
export interface WorkingWeek {
  startDate: CalendarDate;
  minutes: WeekdayMinutes | null;
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

/** Minutes on each weekday as they are stored: whole minutes in a day, at least one working day. */
export function parseWeek(week: { minutes: readonly number[] }): { minutes: WeekdayMinutes } {
  const { minutes } = week;
  if (minutes.length !== 7 || !minutes.every(isMinutesInADay)) {
    throw invalidInput([{ field: "minutes", code: "out_of_range" }]);
  }
  if (minutes.every((day) => day === 0)) {
    throw invalidInput([{ field: "minutes", code: "no_working_day" }]);
  }
  return { minutes: [...minutes] as unknown as WeekdayMinutes };
}

/** A `YYYY-MM-DD` date sent in `field`; refuses anything else. */
export function parseDateField(field: string, value: string): CalendarDate {
  const date = parseCalendarDate(value);
  if (!date) {
    throw invalidInput([{ field, code: "invalid" }]);
  }
  return date;
}

function isMinutesInADay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MINUTES_IN_A_DAY;
}

const MINUTES_IN_A_DAY = 1440;

/**
 * How dated rows make room for a new one from `from` to `until`: the one that started earlier and
 * covers `from` ends the day before, one starting on `from` goes; a later one it would overlap
 * refuses the new one.
 */
export function makeRoomForDatedRow<R extends CalendarDateRange>(
  rows: readonly R[],
  from: CalendarDate,
  until: CalendarDate | null,
): { ended: R | null; replaced: R | null } {
  const overlapsLater = rows.some(
    ({ startDate }) =>
      startDate !== null && startDate > from && (until === null || startDate <= until),
  );
  if (overlapsLater) {
    throw invalidInput([{ field: "endDate", code: "overlaps" }]);
  }
  const replaced = rows.find((row) => row.startDate === from) ?? null;
  const ended =
    rows.find(
      (row) =>
        row !== replaced &&
        (row.startDate === null || row.startDate < from) &&
        coversDate(row, from),
    ) ?? null;
  return { ended, replaced };
}
