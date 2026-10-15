import type { NewEmployeeInput } from "../../../employees";
import type { ImportEmployee } from "../../domain";

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
