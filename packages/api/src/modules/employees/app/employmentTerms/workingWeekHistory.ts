import type { Tx } from "../../../../core/db";
import { createRecordHistoryService } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import type { CalendarDate } from "../../../../utils";
import type { AssignmentOwner, PatternWeek } from "../../domain";

const recordHistory = createRecordHistoryService();

/** A working week from the date it applies from, as history keeps it. */
export type DatedWeek = PatternWeek & { startDate: CalendarDate | null };

/**
 * The line in the owner's history for a change to their working week: the week before and after;
 * null before for a first week, null after when a planned one was cancelled. Terms get it in their
 * history, a person in their working pattern's.
 */
export async function appendWorkingWeekHistory(
  ctx: SecurityContext,
  tx: Tx,
  owner: AssignmentOwner,
  before: DatedWeek | null,
  after: DatedWeek | null,
) {
  const change = {
    field: "workingWeek",
    oldValue: before && weekValue(before),
    newValue: after && weekValue(after),
  };
  await recordHistory.append(ctx, tx, {
    recordType: "termsId" in owner ? "terms" : "working_pattern",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      { recordId: "termsId" in owner ? owner.termsId : owner.employeeId, changes: [change] },
    ],
  });
}

/** A week as history keeps it: a JSON object with its start date. */
function weekValue({ startDate, minutes, bankHolidayCalendar }: DatedWeek): string {
  return JSON.stringify({ startDate, minutes, bankHolidayCalendar });
}
