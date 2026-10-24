import type { Connection, PageArgs } from "../../../../core/pagination";
import { createRecordHistoryReader, type HistoryLine } from "../../../../core/records";
import type { SecurityContext } from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import type { EmployeeRepository } from "../../db";
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
