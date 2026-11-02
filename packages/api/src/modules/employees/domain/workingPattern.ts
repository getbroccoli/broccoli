import type { CalendarDate } from "../../../utils";

/** Minutes worked on each weekday, Monday to Sunday; 0 is not working. */
export type WeekdayMinutes = readonly [number, number, number, number, number, number, number];

/** A policy's minutes from a date until its next week starts; null from the beginning. */
export interface PatternWeek {
  effectiveFrom: CalendarDate | null;
  minutes: WeekdayMinutes;
  /** The minutes one day of leave stands for. */
  fullDayMinutes: number;
}

/** A named way of working that groups and people are put on. */
export interface WorkingPatternPolicy {
  id: string;
  name: string;
  /** The seeded Standard policy, which cannot be deleted. */
  isStandard: boolean;
  /** Oldest first; the first starts from the beginning. */
  weeks: PatternWeek[];
}

/**
 * What a person works from a date until the next working week starts; minutes and full day are
 * null while they have no working pattern.
 */
export interface WorkingWeek {
  effectiveFrom: CalendarDate;
  minutes: WeekdayMinutes | null;
  fullDayMinutes: number | null;
}
