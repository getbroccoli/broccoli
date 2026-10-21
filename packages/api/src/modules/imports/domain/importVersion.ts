import { fingerprint } from "../helpers";
import type { ImportEmployee } from "./importEmployee";

/**
 * A fingerprint of everything Approve would create from these import employees: every value,
 * who is left out, each photo, and who is ready, which an employee taking an email changes. It
 * changes whenever review would show something else.
 */
export function importVersion(
  employees: readonly ImportEmployee[],
  readyEmployees: readonly ImportEmployee[],
): string {
  const ready = employees.map((employee) => readyEmployees.includes(employee));
  return fingerprint({ employees, ready });
}
