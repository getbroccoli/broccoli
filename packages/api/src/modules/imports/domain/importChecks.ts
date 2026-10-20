import {
  hasOpenConflict,
  IMPORT_EMPLOYEE_FIELDS,
  type ImportEmployee,
  type ImportEmployeeField,
  inSourceOrder,
} from "./importEmployee";
import {
  INCOMPLETE_REASONS,
  incompleteReason,
  type IncompleteReason,
} from "./importEmployeeMapping";
import type { ImportSource } from "./importSource";

/** One kind of thing the owner may want to settle in review; none blocks Approve. */
export type ImportCheck =
  | {
      id: `conflict:${ImportEmployeeField}`;
      kind: "conflict";
      field: ImportEmployeeField;
      count: number;
      /** The sources with a value in these conflicts, in source order. */
      sourceIds: string[];
    }
  | {
      id: `incomplete:${IncompleteReason}`;
      kind: "incomplete";
      reason: IncompleteReason;
      count: number;
    };

/** The checks with anything left, conflicts first; left-out import employees count for none. */
export function listChecks(
  sources: readonly ImportSource[],
  employees: readonly ImportEmployee[],
): ImportCheck[] {
  const counted = employees.filter(({ leftOut }) => !leftOut);
  const conflicts = IMPORT_EMPLOYEE_FIELDS.map((field): ImportCheck => {
    const open = counted.filter(({ values }) => hasOpenConflict(values[field]));
    return {
      id: `conflict:${field}`,
      kind: "conflict",
      field,
      count: open.length,
      sourceIds: sourceIdsOf(sources, open, field),
    };
  });
  const incomplete = INCOMPLETE_REASONS.map((reason): ImportCheck => ({
    id: `incomplete:${reason}`,
    kind: "incomplete",
    reason,
    count: counted.filter((employee) => incompleteReason(employee) === reason).length,
  }));
  return [...conflicts, ...incomplete].filter(({ count }) => count > 0);
}

/** Which import employees a check id stands for; an id that is no check stands for no one. */
export type CheckFilter =
  | { kind: "conflict"; field: ImportEmployeeField }
  | { kind: "incomplete"; reason: IncompleteReason }
  | { kind: "none" };

/** Reads a check id a client sent, such as `conflict:jobTitle`. */
export function parseCheckId(checkId: string): CheckFilter {
  const [kind, name] = checkId.split(":");
  const field = IMPORT_EMPLOYEE_FIELDS.find((candidate) => candidate === name);
  if (kind === "conflict" && field) {
    return { kind, field };
  }
  const reason = INCOMPLETE_REASONS.find((candidate) => candidate === name);
  return kind === "incomplete" && reason ? { kind, reason } : { kind: "none" };
}

/** Whether the import employee belongs to the check; a left-out one belongs to none. */
export function isInCheck(employee: ImportEmployee, check: CheckFilter): boolean {
  if (employee.leftOut) {
    return false;
  }
  switch (check.kind) {
    case "conflict":
      return hasOpenConflict(employee.values[check.field]);
    case "incomplete":
      return incompleteReason(employee) === check.reason;
    case "none":
      return false;
  }
}

/** The sources of the records holding a value of `field`, in source order. */
function sourceIdsOf(
  sources: readonly ImportSource[],
  employees: readonly ImportEmployee[],
  field: ImportEmployeeField,
): string[] {
  const ids = new Set<string>();
  for (const { records, values } of employees) {
    const holding = new Set(values[field].options.flatMap(({ recordIds }) => recordIds));
    records.filter(({ id }) => holding.has(id)).forEach(({ sourceId }) => ids.add(sourceId));
  }
  return inSourceOrder(sources)
    .map(({ id }) => id)
    .filter((id) => ids.has(id));
}
