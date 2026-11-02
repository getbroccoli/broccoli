import { invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import {
  createRecordHistoryService,
  type FieldChange,
  type HistoryLine,
} from "../../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
import { parseUuid, todayInUtc } from "../../../../utils";
import { employeeRepository, employmentRepository } from "../../db";
import { type Employee, managerChanges, parseEmployeeIds } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeNotFound } from "./employeeNotFound";

const recordHistory = createRecordHistoryService();

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
        : await recordHistory.append(ctx, tx, {
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

/**
 * Makes `managerId` the manager of these employees from today and returns each one's history
 * change, empty when the manager stays; refuses an unknown manager, one of the employees
 * themselves, or one who already reports to one of them. Needs `lockForWrites` held.
 */
export async function changeManagers(
  tx: Tx,
  employeeIds: readonly string[],
  managerId: string | null,
): Promise<Map<string, FieldChange[]>> {
  const employments = employmentRepository(tx);
  const today = todayInUtc();
  const after = managerId === null ? null : await findAllowedManager(tx, employeeIds, managerId);
  const beforeIds = await employments.findManagerIds(employeeIds, today);
  const before = await findEmployees(tx, [...beforeIds.values()]);
  const changes = new Map(
    employeeIds.map((employeeId) => [
      employeeId,
      managerChanges(before.get(beforeIds.get(employeeId) ?? "") ?? null, after),
    ]),
  );
  const changed = employeeIds.filter((employeeId) => changes.get(employeeId)!.length > 0);
  await employments.setManagers(new Map(changed.map((id) => [id, after?.id ?? null])), today);
  return changes;
}

async function findAllowedManager(
  tx: Tx,
  employeeIds: readonly string[],
  managerId: string,
): Promise<Employee> {
  const id = parseUuid(managerId);
  const manager = id ? await employeeRepository(tx).findById(id) : null;
  if (!manager) {
    throw invalidInput([{ field: "managerId", code: "not_found" }]);
  }
  if (employeeIds.includes(manager.id)) {
    throw invalidInput([{ field: "managerId", code: "self" }]);
  }
  const managersAbove = await employmentRepository(tx).findManagersAbove(
    [manager.id],
    todayInUtc(),
  );
  if (employeeIds.some((employeeId) => managersAbove.get(manager.id)?.includes(employeeId))) {
    throw invalidInput([{ field: "managerId", code: "loop" }]);
  }
  return manager;
}

async function findEmployees(tx: Tx, ids: readonly string[]): Promise<Map<string, Employee>> {
  const employees = ids.length > 0 ? await employeeRepository(tx).findByIds(ids) : [];
  return new Map(employees.map((employee) => [employee.id, employee]));
}

/**
 * Makes each new employee's manager the new employee with the email `managerEmails` gives for
 * theirs, joining `tx`, and returns the managers by employee id. A manager missing from
 * `employees`, or the employee themselves, sets none.
 */
export async function setNewEmployeeManagers(
  tx: Tx,
  employees: readonly Employee[],
  managerEmails: ReadonlyMap<string, string>,
): Promise<Map<string, Employee>> {
  const byEmail = new Map(employees.map((employee) => [employee.email, employee]));
  const managers = new Map<string, Employee>();
  for (const employee of employees) {
    const manager = byEmail.get(managerEmails.get(employee.email) ?? "");
    if (manager && manager !== employee) {
      managers.set(employee.id, manager);
    }
  }
  await employmentRepository(tx).setManagers(
    new Map([...managers].map(([employeeId, manager]) => [employeeId, manager.id])),
    todayInUtc(),
  );
  return managers;
}
