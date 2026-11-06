import { invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate } from "../../../utils";

/** A row that applies from a date to a date; null dates are open. */
export interface Dated {
  /** Null: from the beginning. */
  startDate: CalendarDate | null;
  /** The last day; null: open-ended. */
  endDate: CalendarDate | null;
}

/**
 * What decides one person's working pattern, or their time off policy for one type: their own
 * dated rows ahead of their terms', then the versions of the pattern or policy these name.
 */
export interface PersonTimeline<V extends Dated> {
  /** The person's own pattern or policy id, dated. */
  direct: readonly (Dated & { id: string })[];
  /** The person's terms, dated. */
  terms: readonly (Dated & { termsId: string })[];
  /** The terms' own pattern or policy id; null when the terms have none. */
  idOfTerms: (termsId: string) => string | null;
  /** That pattern's or policy's versions. */
  versions: (id: string) => readonly V[];
}

/** The pattern or policy that applies on `date`: the person's own, else their terms', else none. */
export function idOn<V extends Dated>(timeline: PersonTimeline<V>, date: CalendarDate) {
  const direct = timeline.direct.find((row) => coversDate(row, date));
  if (direct) {
    return direct.id;
  }
  const membership = timeline.terms.find((row) => coversDate(row, date));
  return membership ? timeline.idOfTerms(membership.termsId) : null;
}

/** The version that applies on `date`; null when no pattern or policy, or no version, covers it. */
export function versionOn<V extends Dated>(
  timeline: PersonTimeline<V>,
  date: CalendarDate,
): V | null {
  const id = idOn(timeline, date);
  return id ? (timeline.versions(id).find((version) => coversDate(version, date)) ?? null) : null;
}

/**
 * The versions from `from` to `until`, oldest first: split wherever a row or version starts or
 * ends, neighbours with the same version merged, days without a version left out.
 */
export function versionStretches<V extends Dated>(
  timeline: PersonTimeline<V>,
  from: CalendarDate,
  until: CalendarDate,
): { version: V; startDate: CalendarDate; endDate: CalendarDate }[] {
  const starts = changeDates(timeline, from, until);
  const changes = starts
    .map((startDate) => ({ startDate, version: versionOn(timeline, startDate) }))
    .filter((change, index, all) => change.version !== all[index - 1]?.version);
  return changes.flatMap(({ startDate, version }, index) => {
    const next = changes[index + 1];
    return version
      ? [{ version, startDate, endDate: next ? addDays(next.startDate, -1) : until }]
      : [];
  });
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

/** `from` and every later date up to `until` where a row or version starts, or one has ended. */
function changeDates<V extends Dated>(
  timeline: PersonTimeline<V>,
  from: CalendarDate,
  until: CalendarDate,
): CalendarDate[] {
  const ids = [
    ...timeline.direct.map(({ id }) => id),
    ...timeline.terms.flatMap(({ termsId }) => timeline.idOfTerms(termsId) ?? []),
  ];
  const rows: Dated[] = [
    ...timeline.direct,
    ...timeline.terms,
    ...[...new Set(ids)].flatMap((id) => timeline.versions(id)),
  ];
  const candidates = rows
    .flatMap(({ startDate, endDate }) => [startDate, endDate && addDays(endDate, 1)])
    .filter((date): date is CalendarDate => date !== null && date > from && date <= until);
  return [from, ...new Set(candidates)].toSorted();
}
