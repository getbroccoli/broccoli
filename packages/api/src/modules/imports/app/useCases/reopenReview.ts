import { reopenImportStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { deleteAllEmployees, hasDemoEmployees } from "../../../employees";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Takes setup from the owner or ready step back to the import step, so the owner can change
 * the review and approve again; nobody is added before setup completes, so nothing is lost.
 * Leaving a demo started instead of the import deletes its people, in the same transaction.
 * At any other step it does nothing.
 */
export async function reopenReview(
  { transact, logger }: Pick<ImportContext, "transact" | "logger">,
  ctx: SecurityContext,
): Promise<void> {
  requireImportAccess(ctx);
  const reopened = await transact(async (tx) => {
    if (!(await reopenImportStep(ctx, tx))) {
      return false;
    }
    if (await hasDemoEmployees(ctx, tx)) {
      await deleteAllEmployees(ctx, tx);
    }
    return true;
  });
  if (reopened) {
    logger.info("Reopened the review");
  }
}
