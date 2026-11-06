import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, type CalendarDateRange } from "../../../utils";
import { parseDateField } from "./workingPattern";

/**
 * The earliest date a working pattern or time off policy may change from: the start of the
 * current leave year, since a closed leave year's allowances are never worked out again.
 * shortcut: every leave year starts on 1 January; take the policy's own leave year once they can differ.
 */
export function earliestChangeDate(today: CalendarDate): CalendarDate {
  return `${today.slice(0, 4)}-01-01` as CalendarDate;
}

/** The date a change applies from, sent in `startDate`; refuses one before the earliest date. */
export function parseChangeDate(value: string, today: CalendarDate): CalendarDate {
  const startDate = parseDateField("startDate", value);
  if (startDate < earliestChangeDate(today)) {
    throw invalidInput([{ field: "startDate", code: "too_early" }]);
  }
  return startDate;
}

/**
 * What cancelling the version from `startDate` does: it goes, and the one that ends the day before
 * runs to its end; null when it was the first. CONFLICT unless it starts after today.
 */
export function cancelPlannedVersion<V extends CalendarDateRange>(
  versions: readonly V[],
  startDate: string,
  today: CalendarDate,
): { removed: V; extended: V | null } {
  const removed = versions.find((row) => row.startDate === startDate);
  if (!removed?.startDate || removed.startDate <= today) {
    throw new ApplicationError("CONFLICT", "This change has already started.");
  }
  const dayBefore = addDays(removed.startDate, -1);
  return { removed, extended: versions.find(({ endDate }) => endDate === dayBefore) ?? null };
}
