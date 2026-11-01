import { invalidInput } from "../../../../core/applicationError";
import { appendRecordHistory, type HistoryLine } from "../../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { employeeRepository, employmentRepository } from "../../db";
import type { Employee } from "../../domain";
import { changeManagers } from "./changeManagers";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Makes `managerId` the manager of these employees from today, or no one with null, with a history
 * line for each change, in one transaction; skips the manager among them. Refuses an unknown
 * employee with NOT_FOUND, and the whole call when one change would make a loop. Returns the
 * employees the caller may read, and the history lines it added.
 */
export async function setManagers(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  input: { employeeIds: readonly string[]; managerId: string | null },
): Promise<{ employees: Employee[]; historyLines: HistoryLine[] }> {
  const managerId = input.managerId === null ? null : parseUuid(input.managerId);
  const employeeIds = parseEmployeeIds(input.employeeIds).filter((id) => id !== managerId);
  await ctx.requireWrite("employee", employeeIds, ["managerId"]);
  const { employees, historyLines } = await transact(async (tx) => {
    await employmentRepository(tx).lockForWrites();
    const found = await employeeRepository(tx).findByIds(employeeIds);
    if (found.length !== employeeIds.length) {
      throw employeeNotFound();
    }
    const changes = await changeManagers(tx, employeeIds, input.managerId);
    const records = [...changes]
      .filter(([, fieldChanges]) => fieldChanges.length > 0)
      .map(([recordId, fieldChanges]) => ({ recordId, changes: fieldChanges }));
    const lines =
      records.length === 0
        ? []
        : await appendRecordHistory(ctx, tx, {
            recordType: "employee",
            operation: "UPDATED",
            cause: { kind: "EDITED_DIRECTLY" },
            records,
          });
    return { employees: found, historyLines: lines };
  });
  logger.info(
    { employees: employeeIds.length, changed: historyLines.length, managerId },
    "Set the manager of employees",
  );
  const readable = await ctx.recordScope("employee", "read");
  const isReadable = (id: string) => isInRecordScope(readable, id);
  return {
    employees: employees.filter(({ id }) => isReadable(id)),
    historyLines: historyLines.filter(({ recordId }) => isReadable(recordId)),
  };
}

/** The most employees one call changes, as many as an invite. */
const MAX_EMPLOYEES = 1_000;

/** Canonical ids, each once; an id that is no uuid names no employee. */
function parseEmployeeIds(employeeIds: readonly string[]): string[] {
  const parsed = employeeIds.map(parseUuid);
  if (parsed.some((id) => id === null)) {
    throw employeeNotFound();
  }
  const ids = [...new Set(parsed as string[])];
  if (ids.length === 0 || ids.length > MAX_EMPLOYEES) {
    throw invalidInput([
      { field: "employeeIds", code: ids.length === 0 ? "required" : "too_many" },
    ]);
  }
  return ids;
}
