import type { SecurityContext } from "../../../../core/security";
import { type Connection, type ListArgs, paginate, parseSearch } from "../../../../core/pagination";
import { EMPLOYEE_SORT_VALUES, type EmployeeRepository } from "../../db";
import type { Employee, EmployeeOrder, EmployeeOrderField } from "../../domain";

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

export interface EmployeeListArgs extends ListArgs<EmployeeOrderField> {
  filter?: { search?: string | null } | null;
}

/** Employees, sorted by name unless ordered otherwise and filtered, one page at a time. */
export async function listEmployees(
  employees: EmployeeRepository,
  ctx: SecurityContext,
  { filter, ...listArgs }: EmployeeListArgs,
): Promise<Connection<Employee>> {
  // shortcut: a caller whose reads don't reach everyone is refused the list, not shown their part;
  // every profile reads everyone today. Filter the page by `recordScope` once a read narrows, and
  // the history, avatar and manager reads with it.
  ctx.requireEveryRecord("employee", "read");
  const search = parseSearch(filter?.search);
  return paginate(listArgs, {
    order: DEFAULT_ORDER,
    keysetValues: EMPLOYEE_SORT_VALUES,
    fetch: (query) => employees.findPage({ ...query, search }),
  });
}
