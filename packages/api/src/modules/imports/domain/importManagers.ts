import { parseEmail } from "../helpers";
import type { ImportEmployee } from "./importEmployee";

/** Why a manager the owner sees gives no manager at Approve. */
export const IMPORT_MANAGER_PROBLEMS = [
  "noPersonMatches",
  "severalPeopleMatch",
  "managersFormALoop",
] as const;

export type ImportManagerProblem = (typeof IMPORT_MANAGER_PROBLEMS)[number];

/** An import employee's manager among the people Approve adds, or why there is none. */
export interface ImportManager {
  /** The import employee who manages this one; null without a manager or with a problem. */
  manager: ImportEmployee | null;
  problem: ImportManagerProblem | null;
}

/**
 * Each import employee's manager among `addable`, the ready ones not left out, by import employee
 * key: the owner's choice, else the shown reference matched by the source's ID, email or full
 * name. Only an exact match counts, since a wrong manager would approve someone's leave.
 */
export function matchManagers(
  employees: readonly ImportEmployee[],
  addable: readonly ImportEmployee[],
): Map<string, ImportManager> {
  const managers = new Map(
    employees.map((employee) => [employee.key, managerOf(employee, addable)]),
  );
  for (const key of keysInLoops(managers)) {
    managers.set(key, { manager: null, problem: "managersFormALoop" });
  }
  return managers;
}

const NO_MANAGER: ImportManager = { manager: null, problem: null };

function managerOf(employee: ImportEmployee, addable: readonly ImportEmployee[]): ImportManager {
  const others = addable.filter((candidate) => candidate !== employee);
  const chosen = employee.chosenManager;
  if (chosen) {
    if ("noManager" in chosen) {
      return NO_MANAGER;
    }
    return found(others.filter(({ keys }) => keys.includes(chosen.employeeKey)));
  }
  const reference = employee.values.manager.value;
  if (reference === null) {
    return NO_MANAGER;
  }
  const byId = matchById(employee, reference, others);
  if (byId.length > 0) {
    return found(byId);
  }
  const email = parseEmail(reference);
  if (email !== null) {
    return found(others.filter(({ values }) => values.email.value === email));
  }
  const name = normalisedName(reference);
  return found(others.filter((candidate) => fullNameOf(candidate) === name));
}

function found(matches: readonly ImportEmployee[]): ImportManager {
  if (matches.length === 0) {
    return { manager: null, problem: "noPersonMatches" };
  }
  return matches.length === 1
    ? { manager: matches[0]!, problem: null }
    : { manager: null, problem: "severalPeopleMatch" };
}

/** The candidates holding a record with the reference as its ID, in the sources that name it; IDs are local to a source. */
function matchById(
  employee: ImportEmployee,
  reference: string,
  candidates: readonly ImportEmployee[],
): ImportEmployee[] {
  const naming = employee.values.manager.options.find(({ value }) => value === reference);
  const sourceIds = new Set(
    employee.records
      .filter(({ id }) => naming?.recordIds.includes(id))
      .map(({ sourceId }) => sourceId),
  );
  return candidates.filter(({ records }) =>
    records.some(
      ({ sourceId, externalRecordId }) => sourceIds.has(sourceId) && externalRecordId === reference,
    ),
  );
}

/** A full name compared without case or extra spaces; `Family, Given` reads as `Given Family`. */
function normalisedName(name: string): string {
  const parts = name.split(",");
  const ordered = parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
  return ordered.trim().replace(/\s+/g, " ").toLowerCase();
}

function fullNameOf({ values }: ImportEmployee): string {
  return normalisedName([values.firstName.value, values.lastName.value].join(" "));
}

/** The keys of the import employees whose managers, followed up, come back to them. */
function keysInLoops(managers: ReadonlyMap<string, ImportManager>): Set<string> {
  const inLoops = new Set<string>();
  for (const start of managers.keys()) {
    const path: string[] = [];
    let key: string | undefined = start;
    while (key !== undefined && !path.includes(key) && !inLoops.has(key)) {
      path.push(key);
      key = managers.get(key)?.manager?.key;
    }
    if (key !== undefined && path.includes(key)) {
      path.slice(path.indexOf(key)).forEach((member) => inLoops.add(member));
    }
  }
  return inLoops;
}
