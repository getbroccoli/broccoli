import type { Orm, Tx } from "../../../../core/db";
import {
  type Connection,
  type OrderArg,
  type PageArgs,
  parseOrder,
  parsePage,
  toConnection,
} from "../../../../core/pagination";
import { parseSearch } from "../../../../core/search";
import type { SecurityContext } from "../../../../core/security";
import { type EmployeeOrder, type EmployeeOrderField, findTakenEmails } from "../../../employees";
import { importRepository } from "../../db";
import {
  groupEmployeeRecords,
  type ImportCheck,
  type ImportEmployee,
  type ImportSource,
  isInCheck,
  isReady,
  listChecks,
  parseCheckId,
} from "../../domain";
import { importEmployeeKeyset, matchesSearch, pageImportEmployees } from "./importEmployeeList";

/** The import as the setup review step shows it, read once, so its counts, checks and list agree. */
export interface ImportReview {
  /** How many import employees there are, left out or not. */
  employeeCount: number;
  /** The import employees setup approve adds: ready and not left out. */
  readyEmployees: ImportEmployee[];
  /** The sources of the ready employees, oldest first. */
  readyEmployeeSources: ImportSource[];
  /** What the owner may want to settle before Approve, by kind. */
  checks: ImportCheck[];
  /** The import employees, one page at a time; by name unless ordered otherwise. */
  listEmployees(args: ImportEmployeeListArgs): Connection<ImportEmployee>;
}

export interface ImportEmployeeListArgs extends PageArgs {
  /** Defaults to name order; the direction to ascending. */
  orderBy?: OrderArg<EmployeeOrderField>;
  /** `check` is a check's id: only its import employees. */
  filter?: { search?: string | null; check?: string | null } | null;
}

/** Reads the import's sources, records and choices, and the emails employees already have, joining `db`. */
export async function readImportReview(ctx: SecurityContext, db: Orm | Tx): Promise<ImportReview> {
  const imports = importRepository(db);
  const [sources, records, choices] = await Promise.all([
    imports.listSources(),
    imports.listEmployeeRecords(),
    imports.listChoices("employee"),
  ]);
  const employees = groupEmployeeRecords(sources, records, choices);
  const takenEmails = await findTakenEmails(
    ctx,
    db,
    employees.flatMap(({ values }) => values.email.value ?? []),
  );
  const readyEmployees = employees.filter(
    (employee) => !employee.leftOut && isReady(employee, takenEmails),
  );
  const readySourceIds = new Set(
    readyEmployees.flatMap(({ records: held }) => held.map(({ sourceId }) => sourceId)),
  );
  return {
    employeeCount: employees.length,
    readyEmployees,
    readyEmployeeSources: sources.filter(({ id }) => readySourceIds.has(id)),
    checks: listChecks(sources, employees),
    listEmployees: (args) => listEmployees(employees, args),
  };
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

function listEmployees(
  employees: readonly ImportEmployee[],
  { orderBy, filter, ...pageArgs }: ImportEmployeeListArgs,
): Connection<ImportEmployee> {
  const order = parseOrder(orderBy, DEFAULT_ORDER);
  const search = parseSearch(filter?.search);
  const check = filter?.check ? parseCheckId(filter.check) : null;
  const page = parsePage(pageArgs, importEmployeeKeyset(order));
  const shown = employees.filter(
    (employee) =>
      (search === null || matchesSearch(employee, search)) &&
      (check === null || isInCheck(employee, check)),
  );
  return toConnection(pageImportEmployees(shown, order, page), page.first);
}
