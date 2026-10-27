import { appendRecordHistory, parseChangeReason } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import type { Tx } from "../../../../core/db";
import { employeeRepository, employmentRepository } from "../../db";
import { type Employee, employeeChanges, managerChanges } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Removes an employee and their avatar and records what they held as a deletion line, in one
 * transaction; their history stays. Their reports are left without a manager, with a line each.
 * Returns the deleted employee's id.
 */
export async function deleteEmployee(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  { id, changeReason }: { id: string; changeReason?: string | null },
): Promise<string> {
  ctx.requireOwnerOrSystem();
  const reason = parseChangeReason(changeReason);
  const employeeId = parseUuid(id);
  if (!employeeId) {
    throw employeeNotFound();
  }
  const { historyId, reportCount } = await transact(async (tx) => {
    const reportIds = await employmentRepository(tx).clearManager(employeeId);
    const deleted = await employeeRepository(tx).delete(employeeId);
    if (!deleted) {
      throw employeeNotFound();
    }
    const [line] = await appendRecordHistory(ctx, tx, {
      recordType: "employee",
      operation: "DELETED",
      cause: { kind: "EDITED_DIRECTLY" },
      reason,
      records: [{ recordId: employeeId, changes: employeeChanges(deleted, null) }],
    });
    await recordManagerRemoved(ctx, tx, deleted, reportIds);
    return { historyId: line!.id, reportCount: reportIds.length };
  });
  logger.info({ employeeId, historyId }, "Deleted an employee");
  if (reportCount > 0) {
    logger.info({ employeeId, reportCount }, "Cleared the manager of reports");
  }
  return employeeId;
}

async function recordManagerRemoved(
  ctx: SecurityContext,
  tx: Tx,
  manager: Employee,
  reportIds: readonly string[],
): Promise<void> {
  if (reportIds.length === 0) {
    return;
  }
  await appendRecordHistory(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind: "MANAGER_REMOVED", ref: manager.id },
    records: reportIds.map((recordId) => ({ recordId, changes: managerChanges(manager, null) })),
  });
}

declare module "../../../../core/records" {
  interface CauseKinds {
    /** The person's manager was removed. */
    MANAGER_REMOVED: true;
  }
}
