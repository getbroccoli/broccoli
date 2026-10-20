import { ApplicationError } from "../../../../core/applicationError";
import { approveImportStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees } from "../../../employees";
import { deleteFiles } from "../../../../core/files";
import { importPhotoRepository, importRepository } from "../../db";
import type { ImportContext } from "./importContext";
import { importVersion, toNewEmployeeInput } from "../../domain";
import { readImportEmployees } from "./readImportEmployees";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Turns the import employees that are not left out into employees, with the values and
 * photo review shows, and completes the import step, in one transaction; at any step but
 * `import` it does nothing, so approving twice creates them once. Incomplete ones are not
 * created and lose their photos; refused while a file is being mapped, and when the import
 * no longer matches `version`, the one the owner reviewed, so nobody is added unseen.
 */
export async function approveImport(
  { transact, logger }: ImportContext,
  ctx: SecurityContext,
  version: string,
): Promise<void> {
  requireImportAccess(ctx);
  const result = await transact(async (tx) => {
    // The step move locks the instance row, so a concurrent Approve waits and then finds
    // the step moved. Every setup step change takes that lock before the sources lock.
    if (!(await approveImportStep(ctx, tx))) {
      return null;
    }
    const imports = importRepository(tx);
    await imports.lockSources();
    if (await imports.hasMappingSource()) {
      throw new ApplicationError("CONFLICT", "Files are still being read.");
    }
    const employees = await readImportEmployees(imports);
    if (importVersion(employees) !== version) {
      throw new ApplicationError("CONFLICT", "Your people changed while you were reviewing.");
    }
    const { avatarFileIds, ...counts } = await createImportedEmployees(
      ctx,
      tx,
      employees
        .filter(({ leftOut }) => !leftOut)
        .map((employee) => ({
          ...toNewEmployeeInput(employee),
          avatarFileId: employee.photoFileId ?? undefined,
        })),
    );
    // The import stays for the account step until setup completes (`finishImport`).
    await deleteFiles(tx, await importPhotoRepository(tx).detachPhotosExcept(avatarFileIds));
    return counts;
  });
  if (result) {
    logger.info(result, "Approved the import");
  }
}
