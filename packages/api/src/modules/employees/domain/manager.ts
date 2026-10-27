import type { FieldChange } from "../../../core/records";
import type { Employee } from "./employee";

/** Why a manager change is refused, or null when it is allowed. */
export type ManagerRefusal = "self" | "loop";

/**
 * Whether `managerId` may become `employeeId`'s manager, given everyone above `managerId` in
 * today's reporting lines: their manager, that one's manager, and so on.
 */
export function managerChangeRefusal(
  employeeId: string,
  managerId: string,
  managersAbove: readonly string[],
): ManagerRefusal | null {
  if (managerId === employeeId) {
    return "self";
  }
  return managersAbove.includes(employeeId) ? "loop" : null;
}

/**
 * The history change of a new manager: their ids, with their names as labels so the line still
 * reads after one is removed; empty when the manager stays.
 */
export function managerChanges(before: Employee | null, after: Employee | null): FieldChange[] {
  if (before?.id === after?.id) {
    return [];
  }
  return [
    {
      field: "manager",
      oldValue: before?.id ?? null,
      newValue: after?.id ?? null,
      oldLabel: nameOf(before),
      newLabel: nameOf(after),
    },
  ];
}

function nameOf(employee: Employee | null): string | null {
  return employee && `${employee.firstName} ${employee.lastName}`;
}
