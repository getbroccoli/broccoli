import type { Connection, PageArgs } from "../../../../core/pagination";
import { createRecordHistoryReader, type HistoryLine } from "../../../../core/records";
import { isInRecordScope, type SecurityContext } from "../../../../core/security";
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
  const employeeId = parseUuid(id);
  if (!employeeId) {
    ctx.requireEveryRecord("employee", "read");
    return null;
  }
  await ctx.requireInScope("employee", "read", employeeId);
  return employees.findById(employeeId);
}

/** The signed-in user's own employee; null for a user without one, such as the owner. */
export async function readMyEmployee(
  employees: EmployeeRepository,
  ctx: SecurityContext,
): Promise<Employee | null> {
  const employeeId = ctx.user?.employeeId;
  return employeeId ? employees.findById(employeeId) : null;
}

/**
 * Each employee's manager today, by the id asked for; left out without one, or when the caller
 * may not read the employee or their manager.
 */
export async function readManagers(
  { employees, employments }: { employees: EmployeeRepository; employments: EmploymentRepository },
  ctx: SecurityContext,
  employeeIds: readonly string[],
): Promise<Map<string, Employee>> {
  const scope = await ctx.recordScope("employee", "read");
  const asked = employeeIds.flatMap((askedId) => {
    const id = parseUuid(askedId);
    return id && isInRecordScope(scope, id) ? [{ askedId, id }] : [];
  });
  const managerIds = await employments.findManagerIds(
    asked.map(({ id }) => id),
    todayInUtc(),
  );
  const readable = [...new Set(managerIds.values())].filter((id) => isInRecordScope(scope, id));
  const managers = new Map((await employees.findByIds(readable)).map((m) => [m.id, m]));
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
