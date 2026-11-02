import { invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, parseCalendarDate } from "../../../utils";

/** Minutes worked on each weekday, Monday to Sunday; 0 is not working. */
export type WeekdayMinutes = readonly [number, number, number, number, number, number, number];

/** A pattern's minutes from a date until its next week starts; null from the beginning. */
export interface PatternWeek {
  effectiveFrom: CalendarDate | null;
  minutes: WeekdayMinutes;
  /** The minutes one day of leave stands for. */
  fullDayMinutes: number;
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
 * What a person works from a date until the next working week starts; minutes and full day are
 * null while they have no working pattern.
 */
export interface WorkingWeek {
  effectiveFrom: CalendarDate;
  minutes: WeekdayMinutes | null;
  fullDayMinutes: number | null;
}

/** A dated row of a group's or a person's working pattern: a pattern from a date to a date. */
export interface DatedPattern {
  id: string;
  workingPatternId: string;
  /** Null: from the beginning. */
  effectiveFrom: CalendarDate | null;
  /** The last day; null: open-ended. */
  effectiveUntil: CalendarDate | null;
}

/** A person's group over a period; null dates are open. */
export interface GroupMembership {
  policyGroupId: string;
  effectiveFrom: CalendarDate | null;
  effectiveUntil: CalendarDate | null;
}

/** What decides one person's working weeks. */
export interface WorkingPatternTimeline {
  assignments: readonly DatedPattern[];
  memberships: readonly GroupMembership[];
  /** Each group's dated patterns, by group id. */
  groupPatterns: ReadonlyMap<string, readonly DatedPattern[]>;
  /** Each pattern's weeks, oldest first, by pattern id. */
  patternWeeks: ReadonlyMap<string, readonly PatternWeek[]>;
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

/** The working weeks from `from` to `until`: one wherever minutes or full day change. */
export function workingWeeksOf(
  timeline: WorkingPatternTimeline,
  from: CalendarDate,
  until: CalendarDate,
): WorkingWeek[] {
  const weeks: WorkingWeek[] = [];
  for (const date of changeDates(timeline, from, until)) {
    const week = patternWeekOn(timeline, date);
    const last = weeks.at(-1);
    if (!last || !isSameWeek(last, week)) {
      weeks.push({
        effectiveFrom: date,
        minutes: week?.minutes ?? null,
        fullDayMinutes: week?.fullDayMinutes ?? null,
      });
    }
  }
  return weeks;
}

/** The pattern that applies on `date`: the person's own, else their group's, else none. */
export function patternOn(timeline: WorkingPatternTimeline, date: CalendarDate): string | null {
  const assignment = timeline.assignments.find((row) => coversDate(row, date));
  if (assignment) {
    return assignment.workingPatternId;
  }
  const membership = timeline.memberships.find((row) => coversDate(row, date));
  const groupPatterns = membership ? timeline.groupPatterns.get(membership.policyGroupId) : [];
  return groupPatterns?.find((row) => coversDate(row, date))?.workingPatternId ?? null;
}

/**
 * How dated rows make room for a new one from `from` to `until`: the one that started earlier and
 * covers `from` ends the day before, one starting on `from` goes; a later one it would overlap
 * refuses the new one.
 */
export function makeRoomForDatedPattern(
  rows: readonly DatedPattern[],
  from: CalendarDate,
  until: CalendarDate | null,
): { ended: DatedPattern | null; replaced: DatedPattern | null } {
  const overlapsLater = rows.some(
    ({ effectiveFrom }) =>
      effectiveFrom !== null && effectiveFrom > from && (until === null || effectiveFrom <= until),
  );
  if (overlapsLater) {
    throw invalidInput([{ field: "effectiveUntil", code: "overlaps" }]);
  }
  const replaced = rows.find((row) => row.effectiveFrom === from) ?? null;
  const ended =
    rows.find(
      (row) => row !== replaced && isBefore(row.effectiveFrom, from) && coversDate(row, from),
    ) ?? null;
  return { ended, replaced };
}

/** Whether a dated row applies on `date`. */
export function coversDate(
  row: { effectiveFrom: CalendarDate | null; effectiveUntil: CalendarDate | null },
  date: CalendarDate,
): boolean {
  return (
    isBefore(row.effectiveFrom, date, true) &&
    (row.effectiveUntil === null || date <= row.effectiveUntil)
  );
}

function isBefore(start: CalendarDate | null, date: CalendarDate, orSame = false): boolean {
  return start === null || start < date || (orSame && start === date);
}

function patternWeekOn(timeline: WorkingPatternTimeline, date: CalendarDate): PatternWeek | null {
  const workingPatternId = patternOn(timeline, date);
  const weeks = workingPatternId ? (timeline.patternWeeks.get(workingPatternId) ?? []) : [];
  return weeks.findLast((week) => isBefore(week.effectiveFrom, date, true)) ?? null;
}

/** `from` and every later date up to `until` where a row or week starts, or a row has ended. */
function changeDates(
  timeline: WorkingPatternTimeline,
  from: CalendarDate,
  until: CalendarDate,
): CalendarDate[] {
  const rows = [
    ...timeline.assignments,
    ...timeline.memberships,
    ...[...timeline.groupPatterns.values()].flat(),
  ];
  const candidates = [
    ...rows.flatMap((row) => [
      row.effectiveFrom,
      row.effectiveUntil && addDays(row.effectiveUntil, 1),
    ]),
    ...[...timeline.patternWeeks.values()].flat().map((week) => week.effectiveFrom),
  ];
  const inPeriod = candidates.filter(
    (date): date is CalendarDate => date !== null && date > from && date <= until,
  );
  return [from, ...new Set(inPeriod)].sort();
}

function isSameWeek(week: WorkingWeek, pattern: PatternWeek | null): boolean {
  return (
    week.fullDayMinutes === (pattern?.fullDayMinutes ?? null) &&
    (week.minutes ?? []).join() === (pattern?.minutes ?? []).join()
  );
}

function isMinutesInADay(value: number, least: number): boolean {
  return Number.isInteger(value) && value >= least && value <= MINUTES_IN_A_DAY;
}

const MINUTES_IN_A_DAY = 1440;
