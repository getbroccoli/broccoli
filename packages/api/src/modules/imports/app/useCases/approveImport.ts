import { ApplicationError } from "../../../../core/applicationError";
import { approveImportStep, readInstance } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { lockImport } from "../../db";
import type { ImportContext } from "./importContext";
import { isReading } from "../../domain";
import { addApprovedPeople } from "./addApprovedPeople";
import { readImportReview } from "./importReview";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Completes the import step, adding the people only when that completes setup; otherwise the
 * last step adds them (`addApprovedPeople`). Refused while a file is being mapped, and when
 * the import no longer matches `version`, the one the owner reviewed.
 */
export async function approveImport(
  { transact, logger }: ImportContext,
  ctx: SecurityContext,
  version: string,
): Promise<void> {
  requireImportAccess(ctx);
  const approved = await transact(async (tx) => {
    // The step move locks the instance row, so a concurrent Approve waits and then finds
    // the step moved.
    if (!(await approveImportStep(ctx, tx))) {
      return false;
    }
    const imports = await lockImport(tx);
    if (isReading(await imports.listSources())) {
      throw new ApplicationError("CONFLICT", "Files are still being read.");
    }
    if ((await readImportReview(ctx, tx)).version !== version) {
      throw new ApplicationError("CONFLICT", "Your people changed while you were reviewing.");
    }
    // A self-hosted instance whose owner has an account has no last step to add them at.
    if ((await readInstance(tx)).step === "done") {
      await addApprovedPeople(ctx, tx);
    }
    return true;
  });
  if (approved) {
    logger.info("Approved the import");
  }
}
