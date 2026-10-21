import type { Orm, Tx } from "../../../../core/db";
import { isImportOpen } from "../../../../core/instance";
import { type Connection, type ListArgs, paginate, parseSearch } from "../../../../core/pagination";
import type { SecurityContext } from "../../../../core/security";
import { type EmployeeOrder, type EmployeeOrderField, findTakenEmails } from "../../../employees";
import { importReader } from "../../db";
import {
  groupEmployeeRecords,
  type ImportCheck,
  type ImportEmployee,
  type ImportSource,
  importVersion,
  isInCheck,
  isReady,
  listChecks,
  parseCheckId,
} from "../../domain";
import {
  IMPORT_EMPLOYEE_SORT_VALUES,
  matchesSearch,
  pageImportEmployees,
} from "./importEmployeeList";

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
  /** The fingerprint of what Approve would create, which Approve takes back (`importVersion`). */
  version: string;
}

export interface ImportEmployeeListArgs extends ListArgs<EmployeeOrderField> {
  /** `check` is a check's id: only its import employees. */
  filter?: { search?: string | null; check?: string | null } | null;
}

/**
 * Reads the import's sources, records and choices, and the emails employees already have, joining
 * `db`. `importOpen` overrides the setup step for Approve, which reads right after moving it.
 */
export async function readImportReview(
  ctx: SecurityContext,
  db: Orm | Tx,
  { importOpen }: { importOpen?: boolean } = {},
): Promise<ImportReview> {
  const imports = importReader(db);
  const [sources, records, choices] = await Promise.all([
    imports.listSources(),
    imports.listEmployeeRecords(),
    imports.listChoices("employee"),
  ]);
  const employees = groupEmployeeRecords(sources, records, choices);
  // Once approved, the added employees own these emails and must stay in the setup summary.
  const takenEmails =
    (importOpen ?? (await isImportOpen(db)))
      ? await findTakenEmails(
          ctx,
          db,
          employees.flatMap(({ values }) => values.email.value ?? []),
        )
      : new Set<string>();
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
    version: importVersion(employees, readyEmployees),
  };
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

function listEmployees(
  employees: readonly ImportEmployee[],
  { filter, ...listArgs }: ImportEmployeeListArgs,
): Connection<ImportEmployee> {
  const search = parseSearch(filter?.search);
  const check = filter?.check ? parseCheckId(filter.check) : null;
  const shown = employees.filter(
    (employee) =>
      (search === null || matchesSearch(employee, search)) &&
      (check === null || isInCheck(employee, check)),
  );
  return paginate(listArgs, {
    order: DEFAULT_ORDER,
    keysetValues: IMPORT_EMPLOYEE_SORT_VALUES,
    fetch: (query) => pageImportEmployees(shown, query),
  });
}
