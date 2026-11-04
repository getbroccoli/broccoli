import type { Orm, Tx } from "../../../core/db";
import { createOwnerService } from "../../../core/instance";
import { type Connection, type ListArgs, paginate, parseSearch } from "../../../core/pagination";
import type { SecurityContext } from "../../../core/security";
import {
  createEmployeeSetupService,
  type EmployeeOrder,
  type EmployeeOrderField,
} from "../../employees";
import { importReader } from "../db";
import {
  groupEmployeeRecords,
  type ImportCheck,
  type ImportEmployee,
  type ImportManager,
  type ImportSource,
  importVersion,
  isInCheck,
  isReady,
  listChecks,
  matchManagers,
  parseCheckId,
} from "../domain";
import {
  IMPORT_EMPLOYEE_SORT_VALUES,
  matchesSearch,
  pageImportEmployees,
} from "./importEmployeeList";

const employeeSetup = createEmployeeSetupService();
const owners = createOwnerService();

/** The import as the setup review step shows it, read once, so its counts, checks and list agree. */
export interface ImportReview {
  /** How many import employees there are, left out or not. */
  employeeCount: number;
  /** The import employees setup approve adds: ready and not left out. */
  readyEmployees: ImportEmployee[];
  /**
   * The locations of the ready employees, by name ignoring case and surrounding spaces (the first
   * spelling kept, trimmed), with how many of them are in each; people without one are left out.
   */
  readyLocations: { name: string; peopleCount: number }[];
  /** The sources of the ready employees, oldest first. */
  readyEmployeeSources: ImportSource[];
  /** What the owner may want to settle before Approve, by kind. */
  checks: ImportCheck[];
  /** Each import employee's manager among the ready employees, by import employee key. */
  managers: ReadonlyMap<string, ImportManager>;
  /** The import employees, one page at a time; by name unless ordered otherwise. */
  listEmployees(args: ImportEmployeeListArgs): Connection<ImportEmployee>;
  /** The fingerprint of what Approve would create, which Approve takes back (`importVersion`). */
  version: string;
  /** The instance owner's sign-in email, whoever reads; null before the owner exists. */
  ownerEmail: string | null;
}

export interface ImportEmployeeListArgs extends ListArgs<EmployeeOrderField> {
  /** `check` is a check's id: only its import employees; `ready`: only those Approve adds. */
  filter?: { search?: string | null; check?: string | null; ready?: boolean | null } | null;
}

/**
 * Reads the import's sources, records and choices, and the emails employees already have, joining
 * `db`. No import employee is an employee before setup completes, which deletes the import.
 */
export async function readImportReview(ctx: SecurityContext, db: Orm | Tx): Promise<ImportReview> {
  const imports = importReader(db);
  const [sources, records, choices, owner] = await Promise.all([
    imports.listSources(),
    imports.listEmployeeRecords(),
    imports.listChoices("employee"),
    owners.readOwner(db),
  ]);
  const employees = groupEmployeeRecords(sources, records, choices);
  const takenEmails = await employeeSetup.findTakenEmails(
    ctx,
    db,
    employees.flatMap(({ values }) => values.email.value ?? []),
  );
  const readyEmployees = employees.filter(
    (employee) => !employee.leftOut && isReady(employee, takenEmails),
  );
  const managers = matchManagers(employees, readyEmployees);
  const readySourceIds = new Set(
    readyEmployees.flatMap(({ records: held }) => held.map(({ sourceId }) => sourceId)),
  );
  return {
    employeeCount: employees.length,
    readyEmployees,
    readyLocations: locationsOf(readyEmployees),
    readyEmployeeSources: sources.filter(({ id }) => readySourceIds.has(id)),
    checks: listChecks(sources, employees, managers),
    managers,
    listEmployees: (args) =>
      listEmployees(args.filter?.ready ? readyEmployees : employees, managers, args),
    version: importVersion(employees, readyEmployees),
    ownerEmail: owner?.email ?? null,
  };
}

const DEFAULT_ORDER: EmployeeOrder = { field: "NAME", direction: "ASC" };

/** Matches the locations adding the people creates, which are one per name ignoring case. */
function locationsOf(employees: readonly ImportEmployee[]): ImportReview["readyLocations"] {
  const locations = new Map<string, { name: string; peopleCount: number }>();
  for (const employee of employees) {
    const name = employee.values.location.value?.trim();
    if (name) {
      const found = locations.get(name.toLowerCase()) ?? { name, peopleCount: 0 };
      locations.set(name.toLowerCase(), { ...found, peopleCount: found.peopleCount + 1 });
    }
  }
  return [...locations.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function listEmployees(
  employees: readonly ImportEmployee[],
  managers: ReadonlyMap<string, ImportManager>,
  { filter, ...listArgs }: ImportEmployeeListArgs,
): Connection<ImportEmployee> {
  const search = parseSearch(filter?.search);
  const check = filter?.check ? parseCheckId(filter.check) : null;
  const shown = employees.filter(
    (employee) =>
      (search === null || matchesSearch(employee, search)) &&
      (check === null || isInCheck(employee, check, managers)),
  );
  return paginate(listArgs, {
    order: DEFAULT_ORDER,
    keysetValues: IMPORT_EMPLOYEE_SORT_VALUES,
    fetch: (query) => pageImportEmployees(shown, query),
  });
}
