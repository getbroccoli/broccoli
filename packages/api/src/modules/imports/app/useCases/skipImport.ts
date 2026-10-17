import type { SecurityContext } from "../../../../core/security";
import { completeImportStep } from "../../../../core/instance";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/** Leaves the import step of setup for now; the import's records stay. */
export async function skipImport({ transact }: ImportContext, ctx: SecurityContext): Promise<void> {
  requireImportAccess(ctx);
  await transact((tx) => completeImportStep(ctx, tx));
}
