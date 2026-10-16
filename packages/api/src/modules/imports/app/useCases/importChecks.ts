import {
  hasOpenConflict,
  IMPORT_EMPLOYEE_FIELDS,
  type ImportEmployee,
  type ImportEmployeeField,
  type ImportSource,
  inSourceOrder,
} from "../../domain";
import {
  INCOMPLETE_REASONS,
  incompleteReason,
  type IncompleteReason,
} from "./importEmployeeMapping";

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

/** Whether the import employee belongs to the check with this id; an unknown id matches no one. */
export function isInCheck(employee: ImportEmployee, checkId: string): boolean {
  if (employee.leftOut) {
    return false;
  }
  const [kind, name] = checkId.split(":");
  if (kind === "conflict" && IMPORT_EMPLOYEE_FIELDS.includes(name as ImportEmployeeField)) {
    return hasOpenConflict(employee.values[name as ImportEmployeeField]);
  }
  return kind === "incomplete" && incompleteReason(employee) === name;
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
