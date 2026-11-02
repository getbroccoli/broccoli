import { createSetupStepService } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { createEmployeeSetupService } from "../../../employees";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

const employeeSetup = createEmployeeSetupService();

const setupSteps = createSetupStepService();

/**
 * Takes setup from the owner or ready step back to the import step, so the owner can change
 * the review; does nothing elsewhere. Leaving a demo started instead of the import deletes its people.
 */
export async function reopenReview(
  { transact, logger }: Pick<ImportContext, "transact" | "logger">,
  ctx: SecurityContext,
): Promise<void> {
  requireImportAccess(ctx);
  const reopened = await transact(async (tx) => {
    if (!(await setupSteps.reopenImportStep(ctx, tx))) {
      return false;
    }
    if (await employeeSetup.hasDemoEmployees(ctx, tx)) {
      await employeeSetup.deleteAllEmployees(ctx, tx);
    }
    return true;
  });
  if (reopened) {
    logger.info("Reopened the review");
  }
}
