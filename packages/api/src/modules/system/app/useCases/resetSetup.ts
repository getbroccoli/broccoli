import { ApplicationError } from "../../../../core/applicationError";
import { readInstance, returnToCompanyStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import type { SystemContext } from "./systemContext";

/**
 * Starts a finished setup over: deletes every employee and takes setup back to the company
 * step, in one transaction; the company, the AI choice and the owner stay. Refused at any step
 * but `done`, and during the self-hosted demo, whose owner exits the demo instead.
 */
export async function resetSetup(
  {
    transact,
    deleteAllEmployees,
    deleteFinishedImport,
    logger,
  }: Pick<SystemContext, "transact" | "deleteAllEmployees" | "deleteFinishedImport" | "logger">,
  ctx: SecurityContext,
): Promise<void> {
  ctx.require("RESET_WORKSPACE");
  await transact(async (tx) => {
    if ((await readInstance(tx)).demoExpiresAt) {
      throw new ApplicationError("FORBIDDEN", "Exit the demo instead.");
    }
    // Moving the step first locks the instance row, so a concurrent reset waits and then refuses.
    if (!(await returnToCompanyStep(ctx, tx))) {
      throw new ApplicationError("CONFLICT", "Setup is not done.");
    }
    // A lost completion event can leave the import holding the employees' avatars.
    await deleteFinishedImport(ctx, tx);
    await deleteAllEmployees(ctx, tx);
  });
  logger.info("Reset setup");
}
