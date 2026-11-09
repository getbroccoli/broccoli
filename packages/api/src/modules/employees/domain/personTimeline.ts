import { addDays, type CalendarDate, type CalendarDateRange, coversDate } from "../../../utils";

/**
 * One person's working pattern, or their time off policy for one type, over time: their own dated
 * rows win over their terms', and the pattern or policy found applies through its versions.
 */
export interface PersonTimeline<V extends CalendarDateRange> {
  /** The pattern or policy id on `date`; null when none applies. */
  getIdOnDate(date: CalendarDate): string | null;
  /** The version on `date`; null when no pattern, policy or version covers it. */
  getVersionOnDate(date: CalendarDate): V | null;
  /**
   * The versions from `from` to `until`, oldest first: split wherever a row or version starts or
   * ends, neighbours with the same version merged, days without a version left out. Each names
   * the pattern or policy it belongs to.
   */
  getVersions(
    from: CalendarDate,
    until: CalendarDate,
  ): { id: string; version: V; startDate: CalendarDate; endDate: CalendarDate }[];
  /** Whether `id` applies on some day from `from` on that one of `periods` covers. */
  appliesFrom(id: string, from: CalendarDate, periods: readonly CalendarDateRange[]): boolean;
}

/** What a person's timeline is read from. */
export interface TimelineCreateInputArgs<V extends CalendarDateRange> {
  /** The person's own pattern or policy ids, dated. */
  direct: readonly (CalendarDateRange & { id: string })[];
  /** The person's terms, dated. */
  terms: readonly (CalendarDateRange & { termsId: string })[];
  /** The terms' own pattern or policy id; null when the terms have none. */
  idOfTerms: (termsId: string) => string | null;
  /** A pattern's or policy's versions. */
  versions: (id: string) => readonly V[];
}

export function createPersonTimeline<V extends CalendarDateRange>(
  args: TimelineCreateInputArgs<V>,
): PersonTimeline<V> {
  const getIdOnDate = (date: CalendarDate) => {
    const direct = args.direct.find((row) => coversDate(row, date));
    if (direct) {
      return direct.id;
    }
    const membership = args.terms.find((row) => coversDate(row, date));
    return membership ? args.idOfTerms(membership.termsId) : null;
  };
  const getVersionOnDate = (date: CalendarDate) => {
    const id = getIdOnDate(date);
    return id ? (args.versions(id).find((version) => coversDate(version, date)) ?? null) : null;
  };
  const getVersions = (from: CalendarDate, until: CalendarDate) => {
    const changes = changeDates(args, from, until)
      .map((startDate) => ({ startDate, version: getVersionOnDate(startDate) }))
      .filter((change, index, all) => change.version !== all[index - 1]?.version);
    return changes.flatMap(({ startDate, version }, index) => {
      const next = changes[index + 1];
      const id = getIdOnDate(startDate);
      return version && id
        ? [{ id, version, startDate, endDate: next ? addDays(next.startDate, -1) : until }]
        : [];
    });
  };
  const appliesFrom = (id: string, from: CalendarDate, periods: readonly CalendarDateRange[]) =>
    // The id and the periods only change on these dates, so checking them checks every day.
    [...changeDates(args, from, LAST_DATE), ...startsAfter(periods, from)].some(
      (date) => getIdOnDate(date) === id && periods.some((period) => coversDate(period, date)),
    );
  return { getIdOnDate, getVersionOnDate, getVersions, appliesFrom };
}

const LAST_DATE = "9999-12-31" as CalendarDate;

/** Every date after `from` where one of `rows` starts, or the day after one ends. */
function startsAfter(rows: readonly CalendarDateRange[], from: CalendarDate): CalendarDate[] {
  return rows
    .flatMap(({ startDate, endDate }) => [startDate, endDate && addDays(endDate, 1)])
    .filter((date): date is CalendarDate => date !== null && date > from);
}

/** `from` and every later date up to `until` where a row or version starts, or one has ended. */
function changeDates<V extends CalendarDateRange>(
  args: TimelineCreateInputArgs<V>,
  from: CalendarDate,
  until: CalendarDate,
): CalendarDate[] {
  const ids = [
    ...args.direct.map(({ id }) => id),
    ...args.terms.flatMap(({ termsId }) => args.idOfTerms(termsId) ?? []),
  ];
  const rows: CalendarDateRange[] = [
    ...args.direct,
    ...args.terms,
    ...[...new Set(ids)].flatMap((id) => args.versions(id)),
  ];
  const candidates = startsAfter(rows, from).filter((date) => date <= until);
  return [from, ...new Set(candidates)].toSorted();
}

/** Where a person's week or rules come from: their terms, or set for them alone. */
export type RuleSource = "from_their_terms" | "their_own";

/** A version as it applies to one person from one date, and where it comes from. */
export interface PersonVersion<V> {
  source: RuleSource;
  startDate: CalendarDate;
  /** Null: open-ended. */
  endDate: CalendarDate | null;
  version: V;
}

/**
 * What applies to the person on `today`, then each later change: the person's own when
 * `belongsToTerms` says the pattern or policy is not a terms' own.
 */
export function personVersionsFrom<V extends CalendarDateRange>(
  timeline: PersonTimeline<V>,
  today: CalendarDate,
  belongsToTerms: (id: string) => boolean,
): PersonVersion<V>[] {
  return timeline.getVersions(today, LAST_DATE).map(({ id, version, startDate, endDate }) => ({
    source: belongsToTerms(id) ? "from_their_terms" : "their_own",
    startDate,
    endDate: endDate === LAST_DATE ? null : endDate,
    version,
  }));
}
