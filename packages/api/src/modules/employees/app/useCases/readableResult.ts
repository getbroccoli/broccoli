import type { HistoryLine } from "../../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import type { Employee } from "../../domain";

/**
 * A write's result as its caller may see it: the employee and their history line, or both null
 * when the caller may not read the employee. The write has happened either way.
 */
export async function readableResult(
  ctx: SecurityContext,
  employee: Employee,
  historyLine: HistoryLine | null,
): Promise<{ employee: Employee | null; historyLine: HistoryLine | null }> {
  return isInRecordScope(await ctx.recordScope("employee", "read"), employee.id)
    ? { employee, historyLine }
    : { employee: null, historyLine: null };
}
