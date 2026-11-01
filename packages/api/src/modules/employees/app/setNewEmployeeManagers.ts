import type { Tx } from "../../../core/db";
import { todayInUtc } from "../../../utils";
import { employmentRepository } from "../db";
import type { Employee } from "../domain";

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
