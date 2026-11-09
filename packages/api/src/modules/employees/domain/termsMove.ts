import { addDays, type CalendarDate, coversDate } from "../../../utils";
import { cancelPlannedVersion } from "./datedChange";
import type { TermsMembership } from "./workingPatternTimeline";

/** Why a person is left as they are by a move. */
export type TermsMoveSkipReason = "ALREADY_ON_TERMS" | "LEFT_BEFORE_DATE";

/** What a move does to one person: their terms over time afterwards, or why they stay. */
export type TermsMove =
  | {
      kind: "move";
      /** The date they move from: the date asked, or their start date when they start later. */
      from: CalendarDate;
      /** The terms they were on that date. */
      fromTermsId: string | null;
      memberships: TermsMembership[];
    }
  | { kind: "skip"; reason: TermsMoveSkipReason };

/**
 * Moves one person to `termsId` from `date`: the terms covering it end the day before, and the new
 * ones run to their old end, so a later move stays. A person who starts later moves from their
 * start, as if they had always been on the new terms.
 */
export function planTermsMove(
  person: {
    memberships: readonly TermsMembership[];
    employments: readonly { startDate: CalendarDate | null; endDate: CalendarDate | null }[];
  },
  termsId: string,
  date: CalendarDate,
): TermsMove {
  const ends = person.employments.map(({ endDate }) => endDate);
  if (ends.length > 0 && ends.every((end) => end !== null && end < date)) {
    return { kind: "skip", reason: "LEFT_BEFORE_DATE" };
  }
  const start = person.employments[0]?.startDate ?? null;
  const from = start !== null && start > date ? start : date;
  const fromTermsId = person.memberships.find((row) => coversDate(row, from))?.termsId ?? null;
  if (fromTermsId === termsId) {
    return { kind: "skip", reason: "ALREADY_ON_TERMS" };
  }
  return {
    kind: "move",
    from,
    fromTermsId,
    memberships: withRow(person.memberships, termsId, from, start !== null && from <= start),
  };
}

/**
 * The person's terms once the move starting on `startDate` is cancelled: the terms before it run
 * on to its end. CONFLICT unless it starts after today.
 */
export function cancelTermsMove(
  memberships: readonly TermsMembership[],
  startDate: string,
  today: CalendarDate,
): { cancelled: TermsMembership; memberships: TermsMembership[] } {
  const { removed, extended } = cancelPlannedVersion(memberships, startDate, today);
  return {
    cancelled: removed,
    memberships: merged(
      memberships
        .filter((row) => row !== removed)
        .map((row) => (row === extended ? { ...row, endDate: removed.endDate } : row)),
    ),
  };
}

/**
 * The rows with `termsId` from `from` to the end of the row covering it. From the person's first
 * day, a row they started on (no start date) is replaced whole, as if they had always been on the
 * new terms.
 */
function withRow(
  rows: readonly TermsMembership[],
  termsId: string,
  from: CalendarDate,
  fromFirstDay: boolean,
): TermsMembership[] {
  const sorted = rows.toSorted(byStart);
  const covering = sorted.find((row) => coversDate(row, from));
  const next = sorted.find(({ startDate }) => startDate !== null && startDate > from);
  const startDate = fromFirstDay && covering?.startDate === null ? null : from;
  const endDate = covering
    ? covering.endDate
    : next?.startDate
      ? addDays(next.startDate, -1)
      : null;
  const kept = sorted.flatMap((row): TermsMembership[] => {
    if (row !== covering) return [row];
    if (startDate === null || row.startDate === from) return [];
    return [{ ...row, endDate: addDays(from, -1) }];
  });
  return merged([...kept, { termsId, startDate, endDate }]);
}

/** Rows in date order, with back-to-back rows on the same terms joined into one. */
function merged(rows: readonly TermsMembership[]): TermsMembership[] {
  return rows.toSorted(byStart).reduce<TermsMembership[]>((joined, row) => {
    const last = joined.at(-1);
    if (
      last?.termsId === row.termsId &&
      last.endDate !== null &&
      row.startDate === addDays(last.endDate, 1)
    ) {
      return [...joined.slice(0, -1), { ...last, endDate: row.endDate }];
    }
    return [...joined, row];
  }, []);
}

// A row without a start date began with the employment, before every other.
function byStart(a: TermsMembership, b: TermsMembership): number {
  return (a.startDate ?? "").localeCompare(b.startDate ?? "");
}
