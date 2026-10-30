import { appendRecordHistory, type HistoryLine, parseChangeReason } from "../../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import { parseUuid, todayInUtc } from "../../../../utils";
import type { Tx } from "../../../../core/db";
import { employeeRepository, employmentRepository } from "../../db";
import { type Employee, employeeChanges, managerChanges } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Removes an employee and their avatar and records what they held, their manager too, as a
 * deletion line, in one transaction; their history stays. Their reports are left without a
 * manager, with a line each, which it returns, those of reports the caller may read, with the
 * deleted employee's id.
 */
export async function deleteEmployee(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  { id, changeReason }: { id: string; changeReason?: string | null },
): Promise<{ deletedEmployeeId: string; reportHistoryLines: HistoryLine[] }> {
  const reason = parseChangeReason(changeReason);
  const employeeId = parseUuid(id);
  if (!employeeId) {
    ctx.requireEveryRecord("employee", "delete");
    throw employeeNotFound();
  }
  await ctx.requireInScope("employee", "delete", employeeId);
  const { historyId, reportHistoryLines } = await transact(async (tx) => {
    const employments = employmentRepository(tx);
    // First, as a manager change takes it, so the manager read below is the one being removed.
    await employments.lockManagers();
    const manager = await findManagerOf(tx, employeeId);
    const startDate = (await employments.findStartDates([employeeId])).get(employeeId) ?? null;
    // Before the delete: its foreign key would clear them too, but without saying whose.
    const reportIds = await employments.clearManager(employeeId);
    const deleted = await employeeRepository(tx).delete(employeeId);
    if (!deleted) {
      throw employeeNotFound();
    }
    const [line] = await appendRecordHistory(ctx, tx, {
      recordType: "employee",
      operation: "DELETED",
      cause: { kind: "EDITED_DIRECTLY" },
      reason,
      records: [
        {
          recordId: employeeId,
          changes: [
            ...employeeChanges({ ...deleted, startDate }, null),
            ...managerChanges(manager, null),
          ],
        },
      ],
    });
    return {
      historyId: line!.id,
      reportHistoryLines: await updateReportHistory(ctx, tx, deleted, reportIds),
    };
  });
  logger.info({ employeeId, historyId }, "Deleted an employee");
  if (reportHistoryLines.length > 0) {
    const reportCount = reportHistoryLines.length;
    logger.info({ employeeId, reportCount }, "Cleared the manager of reports");
  }
  const scope = await ctx.recordScope("employee", "read");
  return {
    deletedEmployeeId: employeeId,
    reportHistoryLines: reportHistoryLines.filter(({ recordId }) =>
      isInRecordScope(scope, recordId),
    ),
  };
}

async function findManagerOf(tx: Tx, employeeId: string): Promise<Employee | null> {
  const managerIds = await employmentRepository(tx).findManagerIds([employeeId], todayInUtc());
  const managerId = managerIds.get(employeeId);
  return managerId ? employeeRepository(tx).findById(managerId) : null;
}

/**
 * The removed person's reports are left without a manager. Writes a "manager removed" line on
 * each report's own history, so the change shows there, and returns the lines for their open panels.
 */
async function updateReportHistory(
  ctx: SecurityContext,
  tx: Tx,
  manager: Employee,
  reportIds: readonly string[],
): Promise<HistoryLine[]> {
  if (reportIds.length === 0) {
    return [];
  }
  return appendRecordHistory(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    // The removed manager is in each line's `manager` change; a ref would only repeat them.
    cause: { kind: "MANAGER_REMOVED" },
    records: reportIds.map((recordId) => ({ recordId, changes: managerChanges(manager, null) })),
  });
}
