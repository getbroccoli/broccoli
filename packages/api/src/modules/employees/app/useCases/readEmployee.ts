import type { Connection, PageArgs } from "../../../../core/pagination";
import { type HistoryLine, readRecordHistory } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import type { EmployeeRepository } from "../../db";
import type { Employee } from "../../domain";
import type { EmployeeContext } from "./employeeContext";
import { employeeIdOf } from "./employeeIdOf";

/** The employee with this id, or null when there is none. */
export async function readEmployee(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  id: string,
): Promise<Employee | null> {
  ctx.requireOwnerOrSystem();
  const employeeId = employeeIdOf(id);
  return employeeId ? employees.findById(employeeId) : null;
}

/** An employee's history, newest first, also after the employee is deleted. */
export async function readEmployeeHistory(
  { orm }: EmployeeContext,
  ctx: SecurityContext,
  employeeId: string,
  args: PageArgs,
): Promise<Connection<HistoryLine>> {
  ctx.requireOwnerOrSystem();
  return readRecordHistory(orm, "employee", employeeId, args);
}
