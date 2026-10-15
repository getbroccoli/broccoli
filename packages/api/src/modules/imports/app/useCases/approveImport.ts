import { ApplicationError } from "../../../../core/applicationError";
import { advanceStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees } from "../../../employees";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { toNewEmployeeInput } from "./importEmployeeService";

/**
 * Turns the import's employee records into employees and completes setup, in one
 * transaction; at any step but `import` it does nothing, so approving twice creates
 * them once. Incomplete records stay in the import; refused while a file is being mapped.
 */
export async function approveImport(
  { transact, logger }: ImportContext,
  ctx: SecurityContext,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  const result = await transact(async (tx) => {
    const imports = importRepository(tx);
    await imports.lockSources();
    if (await imports.hasMappingSource()) {
      throw new ApplicationError("CONFLICT", "Files are still being read.");
    }
    // The step move locks the instance row, so a concurrent Approve waits and then finds `done`.
    if (!(await advanceStep(ctx, tx, "import", "done"))) {
      return null;
    }
    const records = await imports.listEmployeeRecords();
    return createImportedEmployees(ctx, tx, records.map(toNewEmployeeInput));
  });
  if (result) {
    logger.info(result, "Approved the import");
  }
}
