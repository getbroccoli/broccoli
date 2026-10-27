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
 * The history change of a new manager, by name so the line still reads after one is removed;
 * empty when the manager stays.
 */
export function managerChanges(before: Employee | null, after: Employee | null): FieldChange[] {
  return before?.id === after?.id
    ? []
    : [{ field: "manager", oldValue: nameOf(before), newValue: nameOf(after) }];
}

function nameOf(employee: Employee | null): string | null {
  return employee && `${employee.firstName} ${employee.lastName}`;
}
