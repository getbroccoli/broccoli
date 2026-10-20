import { ApplicationError } from "../../../../core/applicationError";
import { approveImportStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createImportedEmployees } from "../../../employees";
import { importPhotoRepository, lockImport } from "../../db";
import type { ImportContext } from "./importContext";
import { isReading, toNewEmployeeInput } from "../../domain";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Turns the ready import employees that are not left out into employees, with the values and
 * photo review shows, and completes the import step, in one transaction; at any step but
 * `import` it does nothing, so approving twice creates them once. The others are not
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
    // the step moved.
    if (!(await approveImportStep(ctx, tx))) {
      return null;
    }
    const imports = await lockImport(tx);
    if (isReading(await imports.listSources())) {
      throw new ApplicationError("CONFLICT", "Files are still being read.");
    }
    const review = await readImportReview(ctx, tx);
    if (review.version !== version) {
      throw new ApplicationError("CONFLICT", "Your people changed while you were reviewing.");
    }
    const { readyEmployees } = review;
    const { avatarFileIds, ...counts } = await createImportedEmployees(
      ctx,
      tx,
      readyEmployees.map((employee) => ({
        ...toNewEmployeeInput(employee),
        avatarFileId: employee.photoFileId ?? undefined,
      })),
    );
    // The import stays for the account step until setup completes (`finishImport`).
    await importPhotoRepository(tx).deletePhotosExcept(avatarFileIds);
    return counts;
  });
  if (result) {
    logger.info(result, "Approved the import");
  }
}
