import { addDays, type CalendarDate, type CalendarDateRange, coversDate } from "../../../utils";

/**
 * One person's working pattern, or their time off policy for one type, over time: their own
 * assignment wins; otherwise the assignment of the terms they are on that day; otherwise none.
 */
export interface PersonTimeline<V> {
  /** The version on `date`; null when none applies. */
  getVersionOnDate(date: CalendarDate): V | null;
  /**
   * The versions from `from` to `until`, oldest first: split wherever an assignment or a terms
   * membership starts or ends, neighbours with the same version and source merged, days without a
   * version left out.
   */
  getVersions(from: CalendarDate, until: CalendarDate): DatedVersion<V>[];
  /** Whether a version `matches` accepts applies on some day from `from` on that one of `periods` covers. */
  appliesFrom(
    matches: (versionId: string) => boolean,
    from: CalendarDate,
    periods: readonly CalendarDateRange[],
  ): boolean;
}

/** A version as it applies to one person from a date to a date, and where it comes from. */
export interface DatedVersion<V> {
  versionId: string;
  version: V;
  source: RuleSource;
  startDate: CalendarDate;
  endDate: CalendarDate;
}

/** A version given to its owner from a date to a date, as a timeline reads it. */
type DatedVersionId = CalendarDateRange & { versionId: string };

/** What a person's timeline is read from. */
export interface TimelineCreateInputArgs<V> {
  /** The person's own assignments. */
  direct: readonly DatedVersionId[];
  /** The person's terms, dated. */
  terms: readonly (CalendarDateRange & { termsId: string })[];
  /** A set of terms' assignments. */
  termsAssignments: (termsId: string) => readonly DatedVersionId[];
  /** A version by id; every assigned version is known. */
  version: (versionId: string) => V;
}

export function createPersonTimeline<V>(args: TimelineCreateInputArgs<V>): PersonTimeline<V> {
  const getOnDate = (date: CalendarDate): { versionId: string; source: RuleSource } | null => {
    const direct = args.direct.find((row) => coversDate(row, date));
    if (direct) {
      return { versionId: direct.versionId, source: "their_own" };
    }
    const membership = args.terms.find((row) => coversDate(row, date));
    const inherited =
      membership && args.termsAssignments(membership.termsId).find((row) => coversDate(row, date));
    return inherited ? { versionId: inherited.versionId, source: "from_their_terms" } : null;
  };
  const getVersions = (from: CalendarDate, until: CalendarDate) => {
    const changes = changeDates(args, from, until)
      .map((startDate) => ({ startDate, found: getOnDate(startDate) }))
      .filter(({ found }, index, all) => !isSameFound(found, all[index - 1]?.found));
    return changes.flatMap(({ startDate, found }, index) => {
      const next = changes[index + 1];
      return found
        ? [
            {
              ...found,
              version: args.version(found.versionId),
              startDate,
              endDate: next ? addDays(next.startDate, -1) : until,
            },
          ]
        : [];
    });
  };
  const appliesFrom: PersonTimeline<V>["appliesFrom"] = (matches, from, periods) =>
    // The version and the periods only change on these dates, so checking them checks every day.
    [...changeDates(args, from, LAST_DATE), ...startsAfter(periods, from)].some((date) => {
      const found = getOnDate(date);
      return (
        found !== null &&
        matches(found.versionId) &&
        periods.some((period) => coversDate(period, date))
      );
    });
  return {
    getVersionOnDate: (date) => {
      const found = getOnDate(date);
      return found && args.version(found.versionId);
    },
    getVersions,
    appliesFrom,
  };
}

/**
 * Whether `after` gives the person other versions than `before` on a day from `from` that one of
 * `periods`, such as their employment, covers; where a version comes from does not count.
 */
export function changesWithin<V>(
  before: PersonTimeline<V>,
  after: PersonTimeline<V>,
  from: CalendarDate,
  periods: readonly CalendarDateRange[],
): boolean {
  return periods.some(({ startDate, endDate }) => {
    const start = startDate !== null && startDate > from ? startDate : from;
    const end = endDate ?? LAST_DATE;
    return start <= end && versionSpans(before, start, end) !== versionSpans(after, start, end);
  });
}

const LAST_DATE = "9999-12-31" as CalendarDate;

/** The versions from `start` to `end` as comparable text, neighbours with the same version joined. */
function versionSpans<V>(timeline: PersonTimeline<V>, start: CalendarDate, end: CalendarDate) {
  const spans: { versionId: string; startDate: CalendarDate; endDate: CalendarDate }[] = [];
  for (const { versionId, startDate, endDate } of timeline.getVersions(start, end)) {
    const last = spans.at(-1);
    if (last?.versionId === versionId && addDays(last.endDate, 1) === startDate)
      last.endDate = endDate;
    else spans.push({ versionId, startDate, endDate });
  }
  return JSON.stringify(spans);
}

function isSameFound(
  a: { versionId: string; source: RuleSource } | null,
  b: { versionId: string; source: RuleSource } | null | undefined,
): boolean {
  return b !== undefined && a?.versionId === b?.versionId && a?.source === b?.source;
}

/** Every date after `from` where one of `rows` starts, or the day after one ends. */
function startsAfter(rows: readonly CalendarDateRange[], from: CalendarDate): CalendarDate[] {
  return rows
    .flatMap(({ startDate, endDate }) => [startDate, endDate && addDays(endDate, 1)])
    .filter((date): date is CalendarDate => date !== null && date > from);
}

/** `from` and every later date up to `until` where an assignment or membership starts, or one has ended. */
function changeDates<V>(
  args: TimelineCreateInputArgs<V>,
  from: CalendarDate,
  until: CalendarDate,
): CalendarDate[] {
  const termsIds = new Set(args.terms.map(({ termsId }) => termsId));
  const rows: CalendarDateRange[] = [
    ...args.direct,
    ...args.terms,
    ...[...termsIds].flatMap((termsId) => args.termsAssignments(termsId)),
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

/** What applies to the person on `today`, then each later change. */
export function personVersionsFrom<V>(
  timeline: PersonTimeline<V>,
  today: CalendarDate,
): PersonVersion<V>[] {
  return timeline.getVersions(today, LAST_DATE).map(({ source, version, startDate, endDate }) => ({
    source,
    startDate,
    endDate: endDate === LAST_DATE ? null : endDate,
    version,
  }));
}
