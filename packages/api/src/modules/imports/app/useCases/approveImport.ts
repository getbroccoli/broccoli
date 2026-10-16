import { ApplicationError } from "../../../../core/applicationError";
import { advanceStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees } from "../../../employees";
import { importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { readImportEmployees, toNewEmployeeInput } from "./importEmployeeMapping";

/**
 * Turns the import employees that are not left out into employees, with the values review
 * shows, and completes setup, in one transaction; at any step but `import` it does nothing,
 * so approving twice creates them once. Incomplete ones stay in the import; refused while a
 * file is being mapped.
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
    const employees = await readImportEmployees(imports);
    return createImportedEmployees(
      ctx,
      tx,
      employees.filter(({ leftOut }) => !leftOut).map(toNewEmployeeInput),
    );
  });
  if (result) {
    logger.info(result, "Approved the import");
  }
}
