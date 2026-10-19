import type { SecurityContext } from "../../../../core/security";
import { completeImportStep, type DemoStart } from "../../../../core/instance";
import type { ImportContext } from "./importContext";
import { clearImport } from "./clearImport";
import { requireImportAccess } from "./requireImportAccess";

/**
 * Leaves the import step of setup with the demo company, in one transaction so the step only
 * moves once the demo company is in; the import is deleted, so none of its people are added.
 */
export async function startDemo(context: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  const start = await prepareDemoStart(context);
  await context.transact((tx) => start(ctx, tx));
}

/**
 * Prepares the demo company outside any transaction and returns its start, which completes
 * the import step and fills the company in the caller's transaction.
 */
export async function prepareDemoStart({
  prepareDemoFill,
}: Pick<ImportContext, "prepareDemoFill">): Promise<DemoStart> {
  const fillDemo = await prepareDemoFill();
  return async (ctx, tx) => {
    requireImportAccess(ctx);
    if (await completeImportStep(ctx, tx)) {
      await clearImport(tx);
      await fillDemo(tx);
    }
  };
}
