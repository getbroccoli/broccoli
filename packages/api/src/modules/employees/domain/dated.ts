import { invalidInput } from "../../../core/applicationError";
import type { CalendarDate } from "../../../utils";

/** A row that applies from a date to a date; null dates are open. */
export interface Dated {
  /** Null: from the beginning. */
  startDate: CalendarDate | null;
  /** The last day; null: open-ended. */
  endDate: CalendarDate | null;
}

/** Whether a dated row applies on `date`. */
export function coversDate(row: Dated, date: CalendarDate): boolean {
  return (
    (row.startDate === null || row.startDate <= date) &&
    (row.endDate === null || date <= row.endDate)
  );
}

/**
 * How dated rows make room for a new one from `from` to `until`: the one that started earlier and
 * covers `from` ends the day before, one starting on `from` goes; a later one it would overlap
 * refuses the new one.
 */
export function makeRoomForDatedRow<R extends Dated>(
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
