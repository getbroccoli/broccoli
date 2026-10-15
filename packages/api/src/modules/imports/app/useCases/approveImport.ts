import { advanceStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees, type NewEmployeeInput } from "../../../employees";
import { importRepository } from "../../db";
import type { ImportEmployee } from "../../domain";
import type { ImportContext } from "./importContext";

/**
 * Turns the import's employee records into employees and completes setup, in one
 * transaction; at any step but `import` it does nothing, so approving twice creates
 * them once. Incomplete records stay in the import.
 */
export async function approveImport(
  { transact, logger }: ImportContext,
  ctx: SecurityContext,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  const result = await transact(async (tx) => {
    // The step move locks the instance row, so a concurrent Approve waits and then finds `done`.
    if (!(await advanceStep(ctx, tx, "import", "done"))) {
      return null;
    }
    const records = await importRepository(tx).listEmployeeRecords();
    return createImportedEmployees(ctx, tx, records.map(toNewEmployeeInput));
  });
  if (result) {
    logger.info(result, "Approved the import");
  }
}

/** Missing names and emails become empty, so the employee rules count the record as incomplete. */
function toNewEmployeeInput(record: ImportEmployee): NewEmployeeInput {
  return {
    firstName: record.firstName ?? "",
    lastName: record.lastName ?? "",
    email: record.email ?? "",
    jobTitle: record.jobTitle,
    startDate: record.startDate,
  };
}
