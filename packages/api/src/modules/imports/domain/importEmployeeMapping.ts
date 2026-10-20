import { employeeFieldErrors, type NewEmployeeInput } from "../../employees";
import type { ImportEmployee } from "./importEmployee";

/** Why Approve would leave an import employee out; the first failing field wins. */
export type IncompleteReason = "firstName" | "lastName" | "email" | "other";

export const INCOMPLETE_REASONS: readonly IncompleteReason[] = [
  "firstName",
  "lastName",
  "email",
  "other",
];

/** Whether the import employee is ready: complete, with an email no employee has yet. */
export function isReady(employee: ImportEmployee, takenEmails: ReadonlySet<string>): boolean {
  return incompleteReason(employee) === null && !takenEmails.has(employee.values.email.value!);
}

/** Why the import employee is incomplete, or null when it is ready. */
export function incompleteReason(employee: ImportEmployee): IncompleteReason | null {
  const fields = employeeFieldErrors(toNewEmployeeInput(employee)).map(({ field }) => field);
  if (fields.length === 0) {
    return null;
  }
  return INCOMPLETE_REASONS.find((reason) => fields.includes(reason)) ?? "other";
}

/** Missing names and emails become empty, so the employee rules count it as incomplete. */
export function toNewEmployeeInput({ values }: ImportEmployee): NewEmployeeInput {
  return {
    firstName: values.firstName.value ?? "",
    lastName: values.lastName.value ?? "",
    email: values.email.value ?? "",
    jobTitle: values.jobTitle.value,
    startDate: values.startDate.value,
  };
}
