import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, coversDate } from "../../../utils";
import type { Assignment } from "./assignment";

/**
 * A stretch of a person's own working week, or own rules for one time off type; between stretches
 * their terms' apply.
 */
export interface OwnStretch<V> {
  startDate: CalendarDate;
  endDate: CalendarDate | null;
  value: V;
}

/**
 * A person's own stretches, oldest first, from their assignments and the value each gives. An
 * assignment that carries on the one before to the same version joins it, as one change.
 */
export function ownStretchesOf<V>(
  assignments: readonly Assignment[],
  valueOf: (versionId: string) => V | undefined,
): OwnStretch<V>[] {
  const joined: (Assignment & { value: V })[] = [];
  for (const assignment of assignments.toSorted(byStart)) {
    const value = valueOf(assignment.versionId);
    if (!value) continue;
    const last = joined.at(-1);
    if (
      last?.versionId === assignment.versionId &&
      last.endDate === addDays(assignment.startDate, -1)
    ) {
      last.endDate = assignment.endDate;
    } else {
      joined.push({ ...assignment, value });
    }
  }
  return joined.map(({ startDate, endDate, value }) => ({ startDate, endDate, value }));
}

/** The own stretch covering `date`; null when the terms' apply. */
export function ownStretchOn<V>(
  stretches: readonly OwnStretch<V>[],
  date: CalendarDate,
): OwnStretch<V> | null {
  return stretches.find((stretch) => coversDate(stretch, date)) ?? null;
}

/**
 * The own stretches with `value` from `from`: the stretch covering it ends the day before, and the
 * new one runs to its end, or until the next own stretch; one starting on `from` is replaced.
 */
export function withOwnStretch<V>(
  stretches: readonly OwnStretch<V>[],
  from: CalendarDate,
  value: V,
): OwnStretch<V>[] {
  const covering = ownStretchOn(stretches, from);
  const next = stretches.find(({ startDate }) => startDate > from);
  const endDate = covering ? covering.endDate : next ? addDays(next.startDate, -1) : null;
  return [...endedBefore(stretches, from, covering), { startDate: from, endDate, value }].toSorted(
    byStart,
  );
}

/**
 * The own stretches once the terms' apply from `from`: the stretch covering it ends the day before
 * and later ones go. Refuses, on `startDate`, a person with nothing of their own then or later.
 */
export function withoutOwnStretches<V>(
  stretches: readonly OwnStretch<V>[],
  from: CalendarDate,
): OwnStretch<V>[] {
  const covering = ownStretchOn(stretches, from);
  const later = stretches.filter(({ startDate }) => startDate > from);
  if (!covering && later.length === 0) {
    throw invalidInput([{ field: "startDate", code: "none_of_their_own" }]);
  }
  return endedBefore(stretches, from, covering).filter((stretch) => !later.includes(stretch));
}

/**
 * The own stretches once the change starting on `from` is cancelled, and the value it set (null: a
 * return to the terms). A new stretch goes; a change to one goes and the stretch before runs on; a
 * return to the terms goes and the stretch before runs on to the next. CONFLICT unless it starts
 * after today.
 */
export function cancelOwnChange<V>(
  stretches: readonly OwnStretch<V>[],
  from: CalendarDate,
  today: CalendarDate,
): { stretches: OwnStretch<V>[]; cancelled: V | null } {
  const starting = from > today ? stretches.find(({ startDate }) => startDate === from) : undefined;
  const before = stretches.find(({ endDate }) => endDate === addDays(from, -1));
  if (starting) {
    return {
      stretches: stretches
        .filter((stretch) => stretch !== starting)
        .map((stretch) =>
          stretch === before ? { ...stretch, endDate: starting.endDate } : stretch,
        ),
      cancelled: starting.value,
    };
  }
  if (from > today && before) {
    const next = stretches.find(({ startDate }) => startDate > from);
    const endDate = next ? addDays(next.startDate, -1) : null;
    return {
      stretches: stretches.map((stretch) =>
        stretch === before ? { ...stretch, endDate } : stretch,
      ),
      cancelled: null,
    };
  }
  throw new ApplicationError("CONFLICT", "This change has already started.");
}

/** The stretches with the one covering `from` ending the day before, or gone when it starts then. */
function endedBefore<V>(
  stretches: readonly OwnStretch<V>[],
  from: CalendarDate,
  covering: OwnStretch<V> | null,
): OwnStretch<V>[] {
  return stretches.flatMap((stretch) => {
    if (stretch !== covering) return [stretch];
    return stretch.startDate === from ? [] : [{ ...stretch, endDate: addDays(from, -1) }];
  });
}

function byStart(a: { startDate: CalendarDate }, b: { startDate: CalendarDate }): number {
  return a.startDate.localeCompare(b.startDate);
}
