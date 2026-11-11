import { addDays, type CalendarDate, type CalendarDateRange } from "../../../utils";
import type { PersonTimeline } from "./personTimeline";
import type { PatternVersion, WorkingWeek } from "./workingPattern";

/** A person's terms over a period; null dates are open. */
export interface TermsMembership extends CalendarDateRange {
  termsId: string;
}

/** What decides one person's working weeks. */
export type WorkingPatternTimeline = PersonTimeline<PatternVersion>;

/**
 * The working weeks from `from` to `until`: the first starts on `from`, a new one wherever minutes
 * or calendar change; all null while no pattern applies.
 */
export function workingWeeksOf(
  timeline: WorkingPatternTimeline,
  from: CalendarDate,
  until: CalendarDate,
): WorkingWeek[] {
  const weeks: WorkingWeek[] = [];
  const add = (startDate: CalendarDate, version: PatternVersion | null) => {
    const week = {
      startDate,
      minutes: version?.minutes ?? null,
      bankHolidayCalendar: version?.bankHolidayCalendar ?? null,
    };
    const last = weeks.at(-1);
    if (!last || !isSameWeek(last, week)) {
      weeks.push(week);
    }
  };
  let next = from;
  for (const { version, startDate, endDate } of timeline.getVersions(from, until)) {
    if (startDate > next) {
      add(next, null);
    }
    add(startDate, version);
    next = addDays(endDate, 1);
  }
  if (next <= until) {
    add(next, null);
  }
  return weeks;
}

function isSameWeek(a: WorkingWeek, b: WorkingWeek): boolean {
  return (
    a.bankHolidayCalendar === b.bankHolidayCalendar &&
    (a.minutes ?? []).join() === (b.minutes ?? []).join()
  );
}
