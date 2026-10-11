import { type Actor, requireOwner } from "../../../../core/actor";
import {
  type Connection,
  type PageArgs,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { employeeKeyset, type EmployeeRepository } from "../../db";
import type { Employee } from "../../domain";

/** Employees in name order, one page at a time. */
export async function listEmployees(
  employees: EmployeeRepository,
  actor: Actor | null,
  args: PageArgs,
): Promise<Connection<Employee>> {
  requireOwner(actor);
  const page = parsePage(args, employeeKeyset);
  return toConnection(await employees.findPage(page), page.first);
}
