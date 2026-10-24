import { invalidInput } from "../../../../core/applicationError";
import { appendRecordHistory, type HistoryLine } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { type EmployeeRepository, employeeRepository } from "../../db";
import {
  EmailTakenError,
  type Employee,
  employeeChanges,
  type EmployeeUpdateInput,
  type NewEmployee,
  parseEmployeeUpdate,
} from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

/**
 * Changes the fields an update sends and records the change in the employee's history, in one
 * transaction. A save that changes nothing records nothing; the last save of a field wins.
 */
export async function updateEmployee(
  { transact, logger }: EmployeeContext,
  ctx: SecurityContext,
  { id, ...input }: EmployeeUpdateInput & { id: string },
): Promise<Employee> {
  ctx.requireOwnerOrSystem();
  const { changes, reason } = parseEmployeeUpdate(input);
  const employeeId = parseUuid(id);
  if (!employeeId) {
    throw employeeNotFound();
  }
  const { employee, line } = await transact(async (tx) => {
    const { before, after } = await saveChanges(employeeRepository(tx), employeeId, changes);
    const changed = employeeChanges(before, after);
    if (changed.length === 0) {
      return { employee: after, line: null };
    }
    const [line] = await appendRecordHistory(ctx, tx, {
      recordType: "employee",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      reason,
      records: [{ recordId: employeeId, changes: changed }],
    });
    return { employee: after, line: line! };
  });
  if (line) {
    logger.info({ employeeId, historyId: line.id, fields: fieldsOf(line) }, "Updated an employee");
  }
  return employee;
}

/** The employee before and after saving `changes`; refuses an unknown employee or a taken email. */
async function saveChanges(
  employees: EmployeeRepository,
  employeeId: string,
  changes: Partial<NewEmployee>,
): Promise<{ before: Employee; after: Employee }> {
  if (Object.keys(changes).length === 0) {
    const employee = await employees.findById(employeeId);
    if (!employee) {
      throw employeeNotFound();
    }
    return { before: employee, after: employee };
  }
  try {
    const saved = await employees.update(employeeId, changes);
    if (!saved) {
      throw employeeNotFound();
    }
    return saved;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      throw invalidInput([{ field: "email", code: "taken" }]);
    }
    throw error;
  }
}

function fieldsOf(line: HistoryLine): string[] {
  return line.changes.map(({ field }) => field);
}
