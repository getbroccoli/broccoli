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
  const candidates = indexCandidates(addable);
  const managers = new Map(
    employees.map((employee) => [employee.key, managerOf(employee, candidates)]),
  );
  for (const key of keysInLoops(managers)) {
    managers.set(key, { manager: null, problem: "managersFormALoop" });
  }
  return managers;
}

const NO_MANAGER: ImportManager = { manager: null, problem: null };

/** The addable import employees by each way a manager may be named, built once per review. */
interface Candidates {
  byKey: Map<string, ImportEmployee[]>;
  /** By `<source id> <external record id>`, since IDs are local to a source. */
  bySourceId: Map<string, ImportEmployee[]>;
  byEmail: Map<string, ImportEmployee[]>;
  byName: Map<string, ImportEmployee[]>;
}

function indexCandidates(addable: readonly ImportEmployee[]): Candidates {
  const candidates: Candidates = {
    byKey: new Map(),
    bySourceId: new Map(),
    byEmail: new Map(),
    byName: new Map(),
  };
  for (const employee of addable) {
    employee.keys.forEach((key) => addTo(candidates.byKey, key, employee));
    for (const { sourceId, externalRecordId } of employee.records) {
      if (externalRecordId !== null) {
        addTo(candidates.bySourceId, `${sourceId} ${externalRecordId}`, employee);
      }
    }
    if (employee.values.email.value !== null) {
      addTo(candidates.byEmail, employee.values.email.value, employee);
    }
    addTo(candidates.byName, fullNameOf(employee), employee);
  }
  return candidates;
}

function addTo(index: Map<string, ImportEmployee[]>, key: string, employee: ImportEmployee) {
  const held = index.get(key);
  if (!held) {
    index.set(key, [employee]);
  } else if (held.at(-1) !== employee) {
    // An employee is indexed in one go, so only its own repeats sit at the end.
    held.push(employee);
  }
}

function managerOf(employee: ImportEmployee, candidates: Candidates): ImportManager {
  const others = (matches: ImportEmployee[] | undefined) =>
    (matches ?? []).filter((candidate) => candidate !== employee);
  const chosen = employee.chosenManager;
  if (chosen) {
    if ("noManager" in chosen) {
      return NO_MANAGER;
    }
    return found(others(candidates.byKey.get(chosen.employeeKey)));
  }
  const reference = employee.values.manager.value;
  if (reference === null) {
    return NO_MANAGER;
  }
  const byId = [
    ...new Set(
      sourcesNaming(employee).flatMap((sourceId) =>
        others(candidates.bySourceId.get(`${sourceId} ${reference}`)),
      ),
    ),
  ];
  if (byId.length > 0) {
    return found(byId);
  }
  const email = parseEmail(reference);
  if (email !== null) {
    return found(others(candidates.byEmail.get(email)));
  }
  return found(others(candidates.byName.get(normalisedName(reference))));
}

function found(matches: readonly ImportEmployee[]): ImportManager {
  if (matches.length === 0) {
    return { manager: null, problem: "noPersonMatches" };
  }
  return matches.length === 1
    ? { manager: matches[0]!, problem: null }
    : { manager: null, problem: "severalPeopleMatch" };
}

/** The sources whose IDs the shown reference can name: the picked record's, else those holding it. */
function sourcesNaming({ records, values }: ImportEmployee): string[] {
  const { value, pickedRecordId, options } = values.manager;
  const recordIds = pickedRecordId
    ? [pickedRecordId]
    : (options.find((option) => option.value === value)?.recordIds ?? []);
  return records.filter(({ id }) => recordIds.includes(id)).map(({ sourceId }) => sourceId);
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

/**
 * The keys of the import employees whose managers, followed up, come back to them; each key is
 * walked once.
 */
function keysInLoops(managers: ReadonlyMap<string, ImportManager>): Set<string> {
  const inLoops = new Set<string>();
  const walked = new Set<string>();
  for (const start of managers.keys()) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let key: string | undefined = start;
    while (key !== undefined && !walked.has(key)) {
      walked.add(key);
      path.push(key);
      onPath.add(key);
      key = managers.get(key)?.manager?.key;
    }
    if (key !== undefined && onPath.has(key)) {
      path.slice(path.indexOf(key)).forEach((member) => inLoops.add(member));
    }
  }
  return inLoops;
}
