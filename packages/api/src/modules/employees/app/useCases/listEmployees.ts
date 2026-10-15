import type { SecurityContext } from "../../../../core/security";
import {
  type Connection,
  type OrderArg,
  type PageArgs,
  parseOrder,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { parseSearch } from "../../../../core/search";
import { employeeKeyset, type EmployeeRepository } from "../../db";
import type { Employee, EmployeeOrder, EmployeeOrderField } from "../../domain";

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

export interface EmployeeListArgs extends PageArgs {
  /** Defaults to name order; the direction to ascending. */
  orderBy?: OrderArg<EmployeeOrderField>;
  filter?: { search?: string | null } | null;
}

/** Employees, sorted and filtered, one page at a time. */
export async function listEmployees(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  { orderBy, filter, ...pageArgs }: EmployeeListArgs,
): Promise<Connection<Employee>> {
  ctx.requireOwnerOrSystem();
  const order = parseOrder(orderBy, DEFAULT_ORDER);
  const search = parseSearch(filter?.search);
  const page = parsePage(pageArgs, employeeKeyset(order));
  return toConnection(await employees.findPage({ ...page, order, search }), page.first);
}
