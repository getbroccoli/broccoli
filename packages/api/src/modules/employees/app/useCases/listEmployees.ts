import type { SecurityContext } from "../../../../core/security";
import {
  type Connection,
  type PageArgs,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { parseSearch } from "../../../../core/search";
import { employeeKeyset, type EmployeeOrder, type EmployeeRepository } from "../../db";
import type { Employee } from "../../domain";

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

export interface EmployeeListArgs extends PageArgs {
  /** Defaults to name order; the direction to ascending. */
  orderBy?: { field: EmployeeOrder["field"]; direction?: EmployeeOrder["direction"] | null } | null;
  filter?: { search?: string | null } | null;
}

/** Employees, sorted and filtered, one page at a time. */
export async function listEmployees(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  { orderBy, filter, ...pageArgs }: EmployeeListArgs,
): Promise<Connection<Employee>> {
  ctx.requireOwnerOrSystem();
  const order: EmployeeOrder = orderBy
    ? { field: orderBy.field, direction: orderBy.direction ?? "ASC" }
    : DEFAULT_ORDER;
  const search = parseSearch(filter?.search);
  const page = parsePage(pageArgs, employeeKeyset(order));
  return toConnection(await employees.findPage({ ...page, order, search }), page.first);
}
