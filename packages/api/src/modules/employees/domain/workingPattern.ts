import { invalidInput } from "../../../core/applicationError";
import { type CalendarDate, parseCalendarDate } from "../../../utils";
import type { BankHolidayCalendar } from "../../bankHolidays";
import type { VersionStatus } from "./assignment";

/** Minutes worked on each weekday, Monday to Sunday; 0 is not working. */
export type WeekdayMinutes = readonly [number, number, number, number, number, number, number];

/** A pattern's minutes and whose bank holidays apply, with no dates: assignments say when. */
export interface PatternVersion {
  id: string;
  workingPatternId: string;
  status: VersionStatus;
  /** Set only on a draft: the terms whose screen saved it. */
  termsId: string | null;
  /** 1 on creation, plus 1 on every save of a draft. */
  revision: number;
  minutes: WeekdayMinutes;
  bankHolidayCalendar: BankHolidayCalendar;
}

/** A pattern's minutes and bank holidays: what a version holds. */
export type PatternWeek = Pick<PatternVersion, "minutes" | "bankHolidayCalendar">;

/** A way of working: what its versions share. */
export interface WorkingPattern {
  id: string;
  /** Null on a pattern made on the terms screen. */
  name: string | null;
  /** Oldest first, drafts among them. */
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
