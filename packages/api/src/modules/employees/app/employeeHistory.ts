import type { Tx } from "../../../core/db";
import { appendRecordHistory, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { type Employee, employeeChanges } from "../domain";

declare module "../../../core/records" {
  interface RecordTypes {
    employee: true;
  }
}

/** Appends a creation line for each of these new employees, joining `tx`. */
export async function recordCreatedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  employees: readonly Employee[],
  cause: HistoryAppend["cause"],
): Promise<void> {
  await appendRecordHistory(ctx, tx, {
    recordType: "employee",
    operation: "CREATED",
    cause,
    records: employees.map((employee) => ({
      recordId: employee.id,
      changes: employeeChanges(null, employee),
    })),
  });
}
