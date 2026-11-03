import { invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate } from "../../../utils";
import type { PatternWeek, WorkingWeek } from "./workingPattern";

/** A dated row of terms' or a person's working pattern: a pattern from a date to a date. */
export interface DatedPattern {
  id: string;
  workingPatternId: string;
  /** Null: from the beginning. */
  effectiveFrom: CalendarDate | null;
  /** The last day; null: open-ended. */
  effectiveUntil: CalendarDate | null;
}

/** A person's terms over a period; null dates are open. */
export interface TermsMembership {
  termsId: string;
  effectiveFrom: CalendarDate | null;
  effectiveUntil: CalendarDate | null;
}

/** What decides one person's working weeks. */
export interface WorkingPatternTimeline {
  assignments: readonly DatedPattern[];
  memberships: readonly TermsMembership[];
  /** Dated patterns, by terms id. */
  termsPatterns: ReadonlyMap<string, readonly DatedPattern[]>;
  /** Each pattern's weeks, oldest first, by pattern id. */
  patternWeeks: ReadonlyMap<string, readonly PatternWeek[]>;
}

/** The working weeks from `from` to `until`: one wherever minutes, full day or calendar change. */
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
        bankHolidayCalendar: week?.bankHolidayCalendar ?? null,
      });
    }
  }
  return weeks;
}

/** The pattern that applies on `date`: the person's own, else their terms', else none. */
export function patternOn(timeline: WorkingPatternTimeline, date: CalendarDate): string | null {
  const assignment = timeline.assignments.find((row) => coversDate(row, date));
  if (assignment) {
    return assignment.workingPatternId;
  }
  const membership = timeline.memberships.find((row) => coversDate(row, date));
  const termsPatterns = membership ? timeline.termsPatterns.get(membership.termsId) : [];
  return termsPatterns?.find((row) => coversDate(row, date))?.workingPatternId ?? null;
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

/** A pattern's week in force on `date`: the last that starts on or before it. */
export function weekInForce(weeks: readonly PatternWeek[], date: CalendarDate): PatternWeek | null {
  return weeks.findLast((week) => isBefore(week.effectiveFrom, date, true)) ?? null;
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
  return weekInForce(weeks, date);
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
    ...[...timeline.termsPatterns.values()].flat(),
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
    week.bankHolidayCalendar === (pattern?.bankHolidayCalendar ?? null) &&
    (week.minutes ?? []).join() === (pattern?.minutes ?? []).join()
  );
}
