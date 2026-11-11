import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, coversDate } from "../../../utils";
import type { Assignment } from "./assignment";
import type { PatternWeek } from "./workingPattern";

/** A stretch of a person's own week; between stretches their terms' week applies. */
export interface OwnWeek {
  startDate: CalendarDate;
  endDate: CalendarDate | null;
  week: PatternWeek;
}

/** A person's own weeks, oldest first, from their assignments and the version each gives. */
export function ownWeeksOf(
  assignments: readonly Assignment[],
  versionOf: (versionId: string) => PatternWeek | undefined,
): OwnWeek[] {
  return assignments
    .flatMap(({ versionId, startDate, endDate }) => {
      const version = versionOf(versionId);
      return version ? [{ startDate, endDate, week: weekOf(version) }] : [];
    })
    .toSorted(byStart);
}

/** The own week covering `date`; null when the terms' applies. */
export function ownWeekOn(weeks: readonly OwnWeek[], date: CalendarDate): OwnWeek | null {
  return weeks.find((stretch) => coversDate(stretch, date)) ?? null;
}

/**
 * The own weeks with `week` from `from`: the stretch covering it ends the day before, and the new
 * one runs to its end, or until the next own week; one starting on `from` is replaced.
 */
export function withOwnWeek(
  weeks: readonly OwnWeek[],
  from: CalendarDate,
  week: PatternWeek,
): OwnWeek[] {
  const covering = ownWeekOn(weeks, from);
  const next = weeks.find(({ startDate }) => startDate > from);
  const endDate = covering ? covering.endDate : next ? addDays(next.startDate, -1) : null;
  return [...endedBefore(weeks, from, covering), { startDate: from, endDate, week }].toSorted(
    byStart,
  );
}

/**
 * The own weeks once the terms' week applies from `from`: the stretch covering it ends the day
 * before and later ones go. Refuses, on `startDate`, a person with no own week then or later.
 */
export function withoutOwnWeeks(weeks: readonly OwnWeek[], from: CalendarDate): OwnWeek[] {
  const covering = ownWeekOn(weeks, from);
  const later = weeks.filter(({ startDate }) => startDate > from);
  if (!covering && later.length === 0) {
    throw invalidInput([{ field: "startDate", code: "no_own_week" }]);
  }
  return endedBefore(weeks, from, covering).filter((stretch) => !later.includes(stretch));
}

/**
 * The own weeks once the change starting on `from` is cancelled, and the value it set (null: a
 * return to the terms). A new own week goes; a change to one goes and the week before runs on; a
 * return to the terms goes and the own week before runs on to the next. CONFLICT unless it starts
 * after today.
 */
export function cancelOwnWeekChange(
  weeks: readonly OwnWeek[],
  from: CalendarDate,
  today: CalendarDate,
): { weeks: OwnWeek[]; cancelled: PatternWeek | null } {
  const starting = from > today ? weeks.find(({ startDate }) => startDate === from) : undefined;
  const before = weeks.find(({ endDate }) => endDate === addDays(from, -1));
  if (starting) {
    return {
      weeks: weeks
        .filter((stretch) => stretch !== starting)
        .map((stretch) =>
          stretch === before ? { ...stretch, endDate: starting.endDate } : stretch,
        ),
      cancelled: starting.week,
    };
  }
  if (from > today && before) {
    const next = weeks.find(({ startDate }) => startDate > from);
    const endDate = next ? addDays(next.startDate, -1) : null;
    return {
      weeks: weeks.map((stretch) => (stretch === before ? { ...stretch, endDate } : stretch)),
      cancelled: null,
    };
  }
  throw new ApplicationError("CONFLICT", "This change has already started.");
}

/** The stretches with the one covering `from` ending the day before, or gone when it starts then. */
function endedBefore(
  weeks: readonly OwnWeek[],
  from: CalendarDate,
  covering: OwnWeek | null,
): OwnWeek[] {
  return weeks.flatMap((stretch) => {
    if (stretch !== covering) return [stretch];
    return stretch.startDate === from ? [] : [{ ...stretch, endDate: addDays(from, -1) }];
  });
}

function weekOf({ minutes, bankHolidayCalendar }: PatternWeek): PatternWeek {
  return { minutes, bankHolidayCalendar };
}

function byStart(a: OwnWeek, b: OwnWeek): number {
  return a.startDate.localeCompare(b.startDate);
}
