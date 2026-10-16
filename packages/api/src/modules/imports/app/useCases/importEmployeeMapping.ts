import {
  employeeFieldErrors,
  type NewEmployee,
  type NewEmployeeInput,
  tryParseNewEmployee,
} from "../../../employees";
import { groupEmployeeRecords, type ImportEmployee } from "../../domain";
import type { ImportRepository } from "../../db";

/** Why Approve would leave an import employee out; the first failing field wins. */
export type IncompleteReason = "firstName" | "lastName" | "email" | "other";

export const INCOMPLETE_REASONS: readonly IncompleteReason[] = [
  "firstName",
  "lastName",
  "email",
  "other",
];

/** Every import employee: the import's records grouped, with the owner's choices applied. */
export async function readImportEmployees(imports: ImportRepository): Promise<ImportEmployee[]> {
  const [sources, records, choices] = await Promise.all([
    imports.listSources(),
    imports.listEmployeeRecords(),
    imports.listChoices("employee"),
  ]);
  return groupEmployeeRecords(sources, records, choices);
}

/** The employee an import employee would become, or null when it is incomplete. */
export function toNewEmployee(employee: ImportEmployee): NewEmployee | null {
  return tryParseNewEmployee(toNewEmployeeInput(employee));
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
