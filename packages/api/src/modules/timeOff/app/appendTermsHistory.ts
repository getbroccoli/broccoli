import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import type { TimeOffType } from "../domain";

const recordHistory = createRecordHistoryService();

/**
 * On a terms' policy, the line in the terms' history: the values before and after, rules or a
 * stop; null for none.
 */
export async function appendTermsHistory(
  ctx: SecurityContext,
  tx: Tx,
  policy: { termsId: string | null; timeOffType: TimeOffType },
  oldValue: string | null,
  newValue: string | null,
) {
  if (!policy.termsId) {
    return;
  }
  await recordHistory.append(ctx, tx, {
    recordType: "terms",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: policy.termsId,
        changes: [
          {
            field: `timeOff.${policy.timeOffType.id}`,
            oldValue,
            newValue,
            newLabel: policy.timeOffType.name,
          },
        ],
      },
    ],
  });
}
