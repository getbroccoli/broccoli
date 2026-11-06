import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { PatternVersion, WorkingPattern } from "../domain";

const recordHistory = createRecordHistoryService();

/** On a terms' pattern, the line in the terms' history: the week before and after, or null when cancelled. */
export async function appendWorkingWeekHistory(
  ctx: SecurityContext,
  tx: Tx,
  pattern: WorkingPattern,
  before: Omit<PatternVersion, "id">,
  after: Omit<PatternVersion, "id"> | null,
) {
  if (!pattern.termsId) {
    return;
  }
  await recordHistory.append(ctx, tx, {
    recordType: "terms",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: pattern.termsId,
        changes: [
          {
            field: "workingWeek",
            oldValue: weekValue(before),
            newValue: after && weekValue(after),
          },
        ],
      },
    ],
  });
}

/** A version's week as history keeps it: a JSON object with its start date. */
function weekValue({
  startDate,
  minutes,
  fullDayMinutes,
  bankHolidayCalendar,
}: Omit<PatternVersion, "id">): string {
  return JSON.stringify({ startDate, minutes, fullDayMinutes, bankHolidayCalendar });
}
