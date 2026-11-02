import { invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, parseCalendarDate } from "../../../utils";

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

/** A dated row of a group's or a person's working pattern: a policy from a date to a date. */
export interface DatedPolicy {
  id: string;
  policyId: string;
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
  assignments: readonly DatedPolicy[];
  memberships: readonly GroupMembership[];
  /** Each group's dated policies, by group id. */
  groupPolicies: ReadonlyMap<string, readonly DatedPolicy[]>;
  /** Each policy's weeks, oldest first, by policy id. */
  policyWeeks: ReadonlyMap<string, readonly PatternWeek[]>;
}

const MINUTES_IN_A_DAY = 1440;

/** The name a policy is saved under; refuses a blank one. */
export function parsePolicyName(name: string): string {
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

/** The policy that applies on `date`: the person's own, else their group's, else none. */
export function policyOn(timeline: WorkingPatternTimeline, date: CalendarDate): string | null {
  const assignment = timeline.assignments.find((row) => covers(row, date));
  if (assignment) {
    return assignment.policyId;
  }
  const membership = timeline.memberships.find((row) => covers(row, date));
  const groupPolicies = membership ? timeline.groupPolicies.get(membership.policyGroupId) : [];
  return groupPolicies?.find((row) => covers(row, date))?.policyId ?? null;
}

/**
 * How dated rows make room for a new one from `from` to `until`: the one that started earlier and
 * covers `from` ends the day before, one starting on `from` goes; a later one it would overlap
 * refuses the new one.
 */
export function makeRoom(
  rows: readonly DatedPolicy[],
  from: CalendarDate,
  until: CalendarDate | null,
): { ended: DatedPolicy | null; replaced: DatedPolicy | null } {
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
      (row) => row !== replaced && isBefore(row.effectiveFrom, from) && covers(row, from),
    ) ?? null;
  return { ended, replaced };
}

/** Whether a dated row applies on `date`. */
export function covers(
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
  const policyId = policyOn(timeline, date);
  const weeks = policyId ? (timeline.policyWeeks.get(policyId) ?? []) : [];
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
    ...[...timeline.groupPolicies.values()].flat(),
  ];
  const candidates = [
    ...rows.flatMap((row) => [
      row.effectiveFrom,
      row.effectiveUntil && addDays(row.effectiveUntil, 1),
    ]),
    ...[...timeline.policyWeeks.values()].flat().map((week) => week.effectiveFrom),
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
