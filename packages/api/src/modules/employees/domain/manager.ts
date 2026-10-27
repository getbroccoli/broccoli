import type { FieldChange } from "../../../core/records";
import type { Employee } from "./employee";

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
