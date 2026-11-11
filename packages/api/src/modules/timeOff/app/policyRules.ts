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
  stopValue,
  type TimeOffPolicy,
  type TimeOffType,
} from "../domain";

const recordHistory = createRecordHistoryService();

/** Rules with the date they apply from, or a stop with the first day the type is not offered. */
type RulesLine = (NewPolicyVersion & { startDate: CalendarDate }) | { stopDate: CalendarDate };

/**
 * The line in the owner's history for a change to a type's rules: the rules or stop before and
 * after; null before for an offer, null after when cancelled. Terms get it in their history, a
 * person in theirs.
 */
export async function appendRulesHistory(
  ctx: SecurityContext,
  tx: Tx,
  owner: AssignmentOwner,
  timeOffType: TimeOffType,
  { before, after }: { before: RulesLine | null; after: RulesLine | null },
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
            oldValue: before && lineValue(before),
            newValue: after && lineValue(after),
            newLabel: timeOffType.name,
          },
        ],
      },
    ],
  });
}

function lineValue(line: RulesLine): string {
  return "stopDate" in line ? stopValue(line.stopDate) : rulesValue(line);
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

/** The type acted on; refuses one that does not exist as invalid input. */
export function existingType(types: readonly TimeOffType[], timeOffTypeId: string): TimeOffType {
  const type = types.find(({ id }) => id === parseUuid(timeOffTypeId));
  if (!type) {
    throw invalidInput([{ field: "timeOffTypeId", code: "not_found" }]);
  }
  return type;
}
