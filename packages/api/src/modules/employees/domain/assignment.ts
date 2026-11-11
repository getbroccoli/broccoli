import { invalidInput } from "../../../core/applicationError";
import { addDays, type CalendarDate, type CalendarDateRange, coversDate } from "../../../utils";

/** A working pattern's or time off policy's version: edited while a draft, never once published. */
export const VERSION_STATUSES = ["draft", "published"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

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
 * version from `from`: each row of `sourceVersionId` that covers `from` or starts later gives the
 * new version the rest of its span, the row ending the day before or going. Without such a row,
 * the new one runs from `from` until the owner's next row; a row of another version covering
 * `from` refuses it as overlapping.
 */
export function planReplacement(
  rows: readonly Assignment[],
  sourceVersionId: string | null,
  from: CalendarDate,
): AssignmentPlan {
  const replaced = rows.filter(
    (row) => row.versionId === sourceVersionId && (coversDate(row, from) || row.startDate > from),
  );
  if (replaced.length === 0) {
    if (rows.some((row) => coversDate(row, from))) {
      throw invalidInput([{ field: "endDate", code: "overlaps" }]);
    }
    const next = rows
      .filter(({ startDate }) => startDate > from)
      .toSorted((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return {
      ended: [],
      deletedIds: [],
      added: [{ startDate: from, endDate: next ? addDays(next.startDate, -1) : null }],
    };
  }
  const started = replaced.filter(({ startDate }) => startDate < from);
  return {
    ended: started.map(({ id }) => ({ id, endDate: addDays(from, -1) })),
    deletedIds: replaced.filter(({ startDate }) => startDate >= from).map(({ id }) => id),
    added: replaced.map(({ startDate, endDate }) => ({
      startDate: startDate < from ? from : startDate,
      endDate,
    })),
  };
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

/** The id of a row a plan adds, before it is saved. */
export const NEW_ROW = "new";
