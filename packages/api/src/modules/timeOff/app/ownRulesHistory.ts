import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { CalendarDate } from "../../../utils";
import type { Tx } from "../../../core/db";
import { rulesOfVersion, type TimeOffType } from "../domain";
import { NOT_OFFERED, type OwnRules } from "./ownRulesStore";

const recordHistory = createRecordHistoryService();

/** The line in the person's history: their own rules before and after, each with the date. */
export async function appendOwnRulesHistory(
  ctx: SecurityContext,
  tx: Tx,
  {
    employeeId,
    timeOffType,
    from,
    before,
    after,
    cancelled,
  }: {
    employeeId: string;
    timeOffType: TimeOffType;
    from: CalendarDate;
    /** The rules on the date before the change; null: the terms'. */
    before: OwnRules | null;
    after?: OwnRules | null;
    /** A planned change cancelled, so the line has no new value. */
    cancelled?: boolean;
  },
) {
  await recordHistory.append(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: employeeId,
        changes: [
          {
            field: `timeOff.${timeOffType.id}`,
            oldValue: rulesValue(before, from),
            newValue: cancelled ? null : rulesValue(after ?? null, from),
            oldLabel: timeOffType.name,
            newLabel: timeOffType.name,
          },
        ],
      },
    ],
  });
}

/**
 * Rules as the line in history keeps them, with the date they apply from; null rules are the
 * terms'.
 */
function rulesValue(rules: OwnRules | null, startDate: CalendarDate): string {
  return rules === NOT_OFFERED
    ? JSON.stringify({ startDate, notOffered: true })
    : JSON.stringify({ startDate, rules: rules && rulesOfVersion(rules) });
}
