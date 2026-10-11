import { type Actor, requireOwner } from "../../../../core/actor";
import { invalidInput } from "../../../../core/application-error";
import {
  type Connection,
  type PageArgs,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { employeeKeyset, type EmployeeOrder, type EmployeeRepository } from "../../db";
import type { Employee } from "../../domain";

const SEARCH_MAX_LENGTH = 100;
const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

export interface EmployeeListArgs extends PageArgs {
  /** Defaults to name order; the direction to ascending. */
  orderBy?: { field: EmployeeOrder["field"]; direction?: EmployeeOrder["direction"] | null } | null;
  filter?: { search?: string | null } | null;
}

/** Employees, sorted and filtered, one page at a time. */
export async function listEmployees(
  employees: EmployeeRepository,
  actor: Actor | null,
  { orderBy, filter, ...pageArgs }: EmployeeListArgs,
): Promise<Connection<Employee>> {
  requireOwner(actor);
  const order: EmployeeOrder = orderBy
    ? { field: orderBy.field, direction: orderBy.direction ?? "ASC" }
    : DEFAULT_ORDER;
  const search = parseSearch(filter?.search);
  const page = parsePage(pageArgs, employeeKeyset(order));
  return toConnection(await employees.findPage({ ...page, order, search }), page.first);
}

/** Trimmed, or null when blank. */
function parseSearch(search: string | null | undefined): string | null {
  const trimmed = search?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > SEARCH_MAX_LENGTH) {
    throw invalidInput([{ field: "search", code: "too_long" }]);
  }
  return trimmed;
}
