import {
  employeeFieldErrors,
  type NewEmployee,
  type NewEmployeeInput,
  tryParseNewEmployee,
} from "../../../employees";
import type { ImportEmployee } from "../../domain";

/** Why Approve would leave an import employee out; the first failing field wins. */
export type IncompleteReason = "firstName" | "lastName" | "email" | "other";

const NAMED_REASONS: readonly IncompleteReason[] = ["firstName", "lastName", "email"];

/** The employee an import record would become, or null when it is incomplete. */
export function toNewEmployee(record: ImportEmployee): NewEmployee | null {
  return tryParseNewEmployee(toNewEmployeeInput(record));
}

/** Why the record is incomplete, or null when it is ready. */
export function incompleteReason(record: ImportEmployee): IncompleteReason | null {
  const fields = employeeFieldErrors(toNewEmployeeInput(record)).map(({ field }) => field);
  if (fields.length === 0) {
    return null;
  }
  return NAMED_REASONS.find((reason) => fields.includes(reason)) ?? "other";
}

/** Missing names and emails become empty, so the employee rules count the record as incomplete. */
export function toNewEmployeeInput(record: ImportEmployee): NewEmployeeInput {
  return {
    firstName: record.firstName ?? "",
    lastName: record.lastName ?? "",
    email: record.email ?? "",
    jobTitle: record.jobTitle,
    startDate: record.startDate,
  };
}
