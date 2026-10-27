import type { Connection, PageArgs } from "../../../../core/pagination";
import { createRecordHistoryReader, type HistoryLine } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { parseUuid, todayInUtc } from "../../../../utils";
import type { EmployeeRepository, EmploymentRepository } from "../../db";
import type { Employee } from "../../domain";
import { employeeRecordType } from "../employeeRecordType";
import type { EmployeeContext } from "./employeeContext";

/** The employee with this id, or null when there is none. */
export async function readEmployee(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  id: string,
): Promise<Employee | null> {
  ctx.requireOwnerOrSystem();
  const employeeId = parseUuid(id);
  return employeeId ? employees.findById(employeeId) : null;
}

/** Each employee's manager today, by the id asked for; employees without one are left out. */
export async function readManagers(
  { employees, employments }: { employees: EmployeeRepository; employments: EmploymentRepository },
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<Map<string, Employee>> {
  ctx.requireOwnerOrSystem();
  const ids = new Map(
    employeeIds.flatMap((asked) => {
      const id = parseUuid(asked);
      return id ? [[id, asked] as const] : [];
    }),
  );
  const managerIds = await employments.findManagerIds([...ids.keys()], todayInUtc());
  const managers = new Map(
    (await employees.findByIds([...new Set(managerIds.values())])).map((m) => [m.id, m]),
  );
  return new Map(
    [...managerIds].map(([employeeId, managerId]) => [
      ids.get(employeeId)!,
      managers.get(managerId)!,
    ]),
  );
}

/** An employee's history, newest first, also after the employee is deleted; read as `recordHistory` reads it. */
export function readEmployeeHistory(
  { orm }: EmployeeContext,
  ctx: SecurityContext,
  employeeId: string,
  args: PageArgs,
): Promise<Connection<HistoryLine>> {
  return createRecordHistoryReader(orm, { employee: employeeRecordType(orm) }).readHistory(
    ctx,
    "employee",
    employeeId,
    args,
  );
}
