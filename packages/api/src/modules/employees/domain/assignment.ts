import { invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, type CalendarDateRange, coversDate } from "../../../utils";

/** A working pattern's or time off policy's version: edited while a draft, never once published. */
export type VersionStatus = "draft" | "published";

/** Who an assignment belongs to: one employee, ahead of their terms, or one set of terms. */
export type AssignmentOwner = { employeeId: string } | { termsId: string };

/** A version given to an owner from a date to a date. */
export interface Assignment extends CalendarDateRange {
  id: string;
  versionId: string;
  owner: AssignmentOwner;
  startDate: CalendarDate;
}

/** What publishing a version from a date does to one owner's rows: rows to end, delete and add. */
export interface AssignmentPlan {
  ended: { id: string; endDate: CalendarDate }[];
  deletedIds: string[];
  added: { startDate: CalendarDate; endDate: CalendarDate | null }[];
}

/** Whether two owners are the same employee or the same terms. */
export function isSameOwner(a: AssignmentOwner, b: AssignmentOwner): boolean {
  return "employeeId" in a
    ? "employeeId" in b && a.employeeId === b.employeeId
    : "termsId" in b && a.termsId === b.termsId;
}

/**
 * How one owner's rows (for patterns all of them, for policies those of one type) make room for a
 * version from `from`: each row `isReplaced` accepts, usually those of the same pattern or policy,
 * that covers `from` or starts later gives the new version the rest of its span, the row ending
 * the day before or going. Without such a row, the new one is open-ended from `from`; another row
 * covering `from` or starting later refuses it as overlapping.
 */
export function planReplacement<R extends Assignment>(
  rows: readonly R[],
  isReplaced: (row: R) => boolean,
  from: CalendarDate,
): AssignmentPlan {
  const replaced = rows.filter(
    (row) => isReplaced(row) && (coversDate(row, from) || row.startDate > from),
  );
  if (replaced.length === 0) {
    if (rows.some((row) => coversDate(row, from) || row.startDate > from)) {
      throw invalidInput([{ field: "endDate", code: "overlaps" }]);
    }
    return { ended: [], deletedIds: [], added: [{ startDate: from, endDate: null }] };
  }
  const started = replaced.filter(({ startDate }) => startDate < from);
  return {
    ended: started.map(({ id }) => ({ id, endDate: addDays(from, -1) })),
    deletedIds: replaced.filter(({ startDate }) => startDate >= from).map(({ id }) => id),
    added: joinContiguous(
      replaced.map(({ startDate, endDate }) => ({
        startDate: startDate < from ? from : startDate,
        endDate,
      })),
    ),
  };
}

/**
 * How one owner's rows `isReplaced` accepts end from `from`, as `planReplacement` makes room but
 * adding none; null when none covers `from` or starts later.
 */
export function planEnd<R extends Assignment>(
  rows: readonly R[],
  isReplaced: (row: R) => boolean,
  from: CalendarDate,
): AssignmentPlan | null {
  if (!rows.some((row) => isReplaced(row) && (coversDate(row, from) || row.startDate > from))) {
    return null;
  }
  return { ...planReplacement(rows, isReplaced, from), added: [] };
}

/**
 * `planReplacement`, keeping a refusal instead of throwing it, so an owner nobody publishes to
 * cannot refuse the others; publishing to that owner throws `refusal`.
 */
export function planOrRefusal<R extends Assignment>(
  rows: readonly R[],
  isReplaced: (row: R) => boolean,
  from: CalendarDate,
): { plan: AssignmentPlan | null; refusal: unknown } {
  try {
    return { plan: planReplacement(rows, isReplaced, from), refusal: null };
  } catch (refusal) {
    return { plan: null, refusal };
  }
}

/**
 * One owner's rows as `plan` leaves them, oldest first; the added rows carry `versionId` and the
 * id `NEW_ROW`, as they have none yet.
 */
export function rowsAfterPlan(
  rows: readonly Assignment[],
  plan: AssignmentPlan,
  { versionId, owner }: Pick<Assignment, "versionId" | "owner">,
): Assignment[] {
  const ends = new Map(plan.ended.map(({ id, endDate }) => [id, endDate]));
  return [
    ...rows
      .filter(({ id }) => !plan.deletedIds.includes(id))
      .map((row) => ({ ...row, endDate: ends.get(row.id) ?? row.endDate })),
    ...plan.added.map((span) => ({ ...span, id: NEW_ROW, versionId, owner })),
  ].toSorted((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * The planned rows `plan` deletes after the first row it adds: changes a publish from an earlier
 * date replaces, which history records as cancelled.
 */
export function plannedRowsReplaced<R extends Assignment>(
  rows: readonly R[],
  plan: AssignmentPlan,
): R[] {
  const from = plan.added[0]?.startDate;
  return rows.filter(
    ({ id, startDate }) => plan.deletedIds.includes(id) && from !== undefined && startDate > from,
  );
}

/** The id of a row a plan adds, before it is saved. */
export const NEW_ROW = "new";

/** Spans oldest first, each one that follows on from the one before joined to it. */
function joinContiguous(spans: AssignmentPlan["added"]): AssignmentPlan["added"] {
  const joined: AssignmentPlan["added"] = [];
  for (const span of spans.toSorted((a, b) => a.startDate.localeCompare(b.startDate))) {
    const last = joined.at(-1);
    if (last?.endDate && addDays(last.endDate, 1) === span.startDate) {
      joined[joined.length - 1] = { ...last, endDate: span.endDate };
    } else {
      joined.push(span);
    }
  }
  return joined;
}
