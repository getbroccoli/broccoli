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
  const asked = employeeIds.flatMap((askedId) => {
    const id = parseUuid(askedId);
    return id ? [{ askedId, id }] : [];
  });
  const managerIds = await employments.findManagerIds(
    asked.map(({ id }) => id),
    todayInUtc(),
  );
  const managers = new Map(
    (await employees.findByIds([...new Set(managerIds.values())])).map((m) => [m.id, m]),
  );
  return new Map(
    asked.flatMap(({ askedId, id }) => {
      const manager = managers.get(managerIds.get(id) ?? "");
      return manager ? [[askedId, manager] as const] : [];
    }),
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
