import type { Tx } from "../../../core/db";
import { appendRecordHistory, type HistoryAppend } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { employmentRepository } from "../db";
import { type Employee, employeeChanges, managerChanges } from "../domain";

/** Appends a creation line for each of these new employees, with their manager by id, joining `tx`. */
export async function recordCreatedEmployees(
  ctx: SecurityContext,
  tx: Tx,
  employees: readonly Employee[],
  cause: HistoryAppend["cause"],
  managers: ReadonlyMap<string, Employee> = new Map(),
): Promise<void> {
  const startDates = await employmentRepository(tx).findStartDates(employees.map(({ id }) => id));
  await appendRecordHistory(ctx, tx, {
    recordType: "employee",
    operation: "CREATED",
    cause,
    records: employees.map((employee) => ({
      recordId: employee.id,
      changes: [
        ...employeeChanges(null, { ...employee, startDate: startDates.get(employee.id) ?? null }),
        ...managerChanges(null, managers.get(employee.id) ?? null),
      ],
    })),
  });
}
