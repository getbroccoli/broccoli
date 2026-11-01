import { invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { FieldChange } from "../../../../core/records";
import { parseUuid, todayInUtc } from "../../../../utils";
import { employeeRepository, employmentRepository } from "../../db";
import { type Employee, managerChanges } from "../../domain";

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
