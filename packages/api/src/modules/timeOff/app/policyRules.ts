import { invalidInput } from "../../../core/applicationError";
import type { Tx } from "../../../core/db";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type CalendarDate, parseUuid } from "../../../utils";
import type { AssignmentOwner, EmployeeReadService } from "../../employees";
import {
  type NewPolicyVersion,
  type PolicyVersion,
  rulesValue,
  type TimeOffPolicy,
  type TimeOffType,
} from "../domain";

const recordHistory = createRecordHistoryService();

/**
 * The line in the owner's history for a change to a type's rules: the rules before and after, each
 * with the date it applies from; null before for an offer, null after when cancelled. Terms get it
 * in their history, a person in theirs.
 */
export async function appendRulesHistory(
  ctx: SecurityContext,
  tx: Tx,
  owner: AssignmentOwner,
  timeOffType: TimeOffType,
  {
    before,
    after,
  }: {
    before: (NewPolicyVersion & { startDate: CalendarDate }) | null;
    after: (NewPolicyVersion & { startDate: CalendarDate }) | null;
  },
) {
  await recordHistory.append(ctx, tx, {
    recordType: "termsId" in owner ? "terms" : "employee",
    operation: "UPDATED",
    cause: { kind: "EDITED_DIRECTLY" },
    records: [
      {
        recordId: "termsId" in owner ? owner.termsId : owner.employeeId,
        changes: [
          {
            field: `timeOff.${timeOffType.id}`,
            oldValue: before && rulesValue(before),
            newValue: after && rulesValue(after),
            newLabel: timeOffType.name,
          },
        ],
      },
    ],
  });
}

/** Why allowances change when a policy's rules change from a date. */
export function rulesChanged(timeOffPolicyId: string, from: CalendarDate) {
  return { kind: "TIME_OFF_RULES_CHANGED" as const, ref: `${timeOffPolicyId}:${from}`, from };
}

export function versionOf(policies: readonly TimeOffPolicy[], versionId: string): PolicyVersion {
  return policies.flatMap(({ versions }) => versions).find(({ id }) => id === versionId)!;
}

/** The ids a repository reads one owner's assignments by. */
export function ownerIds(owner: AssignmentOwner) {
  return "employeeId" in owner
    ? { employeeIds: [owner.employeeId] }
    : { termsIds: [owner.termsId] };
}

/** The employees an owner's rules apply to: the person, or everyone ever on the terms. */
export async function employeesOf(
  employeeReads: Pick<EmployeeReadService, "readTermsMemberIds">,
  tx: Tx,
  owner: AssignmentOwner,
): Promise<string[]> {
  return "employeeId" in owner
    ? [owner.employeeId]
    : ((await employeeReads.readTermsMemberIds(tx, owner.termsId)) ?? []);
}

/** The terms acted on; refuses an id that names none as invalid input. */
export async function existingTerms(
  employeeReads: Pick<EmployeeReadService, "readTermsMemberIds">,
  tx: Tx,
  id: string,
): Promise<string> {
  const termsId = parseUuid(id);
  if (!termsId || (await employeeReads.readTermsMemberIds(tx, termsId)) === null) {
    throw invalidInput([{ field: "termsId", code: "not_found" }]);
  }
  return termsId;
}
