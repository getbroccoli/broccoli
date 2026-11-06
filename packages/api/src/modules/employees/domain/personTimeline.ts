import { addDays, type CalendarDate, type CalendarDateRange, coversDate } from "../../../utils";

/**
 * One person's working pattern, or their time off policy for one type, over time: their own dated
 * rows win over their terms', and the pattern or policy found applies through its versions.
 */
export interface PersonTimeline<V extends CalendarDateRange> {
  /** The pattern or policy id on `date`; null when none applies. */
  idOn(date: CalendarDate): string | null;
  /** The version on `date`; null when no pattern, policy or version covers it. */
  versionOn(date: CalendarDate): V | null;
  /**
   * The versions from `from` to `until`, oldest first: split wherever a row or version starts or
   * ends, neighbours with the same version merged, days without a version left out.
   */
  stretches(
    from: CalendarDate,
    until: CalendarDate,
  ): { version: V; startDate: CalendarDate; endDate: CalendarDate }[];
}

/** What a person's timeline is read from. */
export interface TimelineSources<V extends CalendarDateRange> {
  /** The person's own pattern or policy ids, dated. */
  direct: readonly (CalendarDateRange & { id: string })[];
  /** The person's terms, dated. */
  terms: readonly (CalendarDateRange & { termsId: string })[];
  /** The terms' own pattern or policy id; null when the terms have none. */
  idOfTerms: (termsId: string) => string | null;
  /** A pattern's or policy's versions. */
  versions: (id: string) => readonly V[];
}

export function personTimeline<V extends CalendarDateRange>(
  sources: TimelineSources<V>,
): PersonTimeline<V> {
  const idOn = (date: CalendarDate) => {
    const direct = sources.direct.find((row) => coversDate(row, date));
    if (direct) {
      return direct.id;
    }
    const membership = sources.terms.find((row) => coversDate(row, date));
    return membership ? sources.idOfTerms(membership.termsId) : null;
  };
  const versionOn = (date: CalendarDate) => {
    const id = idOn(date);
    return id ? (sources.versions(id).find((version) => coversDate(version, date)) ?? null) : null;
  };
  const stretches = (from: CalendarDate, until: CalendarDate) => {
    const changes = changeDates(sources, from, until)
      .map((startDate) => ({ startDate, version: versionOn(startDate) }))
      .filter((change, index, all) => change.version !== all[index - 1]?.version);
    return changes.flatMap(({ startDate, version }, index) => {
      const next = changes[index + 1];
      return version
        ? [{ version, startDate, endDate: next ? addDays(next.startDate, -1) : until }]
        : [];
    });
  };
  return { idOn, versionOn, stretches };
}

/** `from` and every later date up to `until` where a row or version starts, or one has ended. */
function changeDates<V extends CalendarDateRange>(
  sources: TimelineSources<V>,
  from: CalendarDate,
  until: CalendarDate,
): CalendarDate[] {
  const ids = [
    ...sources.direct.map(({ id }) => id),
    ...sources.terms.flatMap(({ termsId }) => sources.idOfTerms(termsId) ?? []),
  ];
  const rows: CalendarDateRange[] = [
    ...sources.direct,
    ...sources.terms,
    ...[...new Set(ids)].flatMap((id) => sources.versions(id)),
  ];
  const candidates = rows
    .flatMap(({ startDate, endDate }) => [startDate, endDate && addDays(endDate, 1)])
    .filter((date): date is CalendarDate => date !== null && date > from && date <= until);
  return [from, ...new Set(candidates)].toSorted();
}
