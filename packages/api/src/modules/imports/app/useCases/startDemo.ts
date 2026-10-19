import type { SecurityContext } from "../../../../core/security";
import { completeImportStep } from "../../../../core/instance";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Leaves the import step of setup with the demo company, in one transaction so the step only
 * moves once the demo company is in; the import's records stay.
 */
export async function startDemo(
  { transact, prepareDemoFill }: ImportContext,
  ctx: SecurityContext,
): Promise<void> {
  requireImportAccess(ctx);
  const fillDemo = await prepareDemoFill();
  await transact(async (tx) => {
    if (await completeImportStep(ctx, tx)) {
      await fillDemo(tx);
    }
  });
}
