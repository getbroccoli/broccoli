import type { SecurityContext } from "../../../../core/security";
import { runInTransaction } from "../../../../core/db";
import { advanceStep } from "../../../../core/instance";
import type { ImportContext } from "./importContext";

/** Leaves the import step of setup for now; the import's records stay. */
export async function skipImport(
  { orm, eventBus }: ImportContext,
  ctx: SecurityContext,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  await runInTransaction(orm, eventBus, (tx) => advanceStep(ctx, tx, "import", "done"));
}
