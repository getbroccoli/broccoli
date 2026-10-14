import type { SecurityContext } from "../../../../core/security";
import { advanceStep } from "../../../../core/instance";
import type { ImportContext } from "./importContext";

/** Leaves the import step of setup for now; the import's records stay. */
export async function skipImport({ transact }: ImportContext, ctx: SecurityContext): Promise<void> {
  ctx.requireOwnerOrSystem();
  await transact((tx) => advanceStep(ctx, tx, "import", "done"));
}
