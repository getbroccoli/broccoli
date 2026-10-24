import { appendRecordHistory, parseChangeReason } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { employeeRepository } from "../../db";
import { employeeChanges } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Removes an employee and their avatar and records what they held as a deletion line, in one
 * transaction; their history stays. Returns the deleted employee's id.
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
  const historyId = await transact(async (tx) => {
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
    return line!.id;
  });
  logger.info({ employeeId, historyId }, "Deleted an employee");
  return employeeId;
}
