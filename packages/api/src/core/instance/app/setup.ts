import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { SetupStep } from "../domain";

/** Where the instance is in its first-run flow, through the pool or joining `tx`. */
export function readSetupStep(db: Orm | Tx): Promise<SetupStep> {
  return instanceRepository(db).readStep();
}

/**
 * Moves the setup step from `from` to `to`, joining `tx`; does nothing at any other
 * step. Returns whether it moved. Reaching `done` publishes `instance.setup_completed`.
 */
export async function advanceStep(
  ctx: SecurityContext,
  tx: Tx,
  from: SetupStep,
  to: SetupStep,
): Promise<boolean> {
  ctx.requireSetupAccess();
  const moved = await instanceRepository(tx).advanceStep(from, to);
  if (moved && to === "done") {
    tx.publish("instance.setup_completed", null);
  }
  return moved;
}

/** Whether the import still takes changes: setup has not moved past the import step. */
export async function isImportOpen(db: Orm | Tx): Promise<boolean> {
  const step = await readSetupStep(db);
  return step === "company" || step === "import";
}

/**
 * Leaves the import step, joining `tx`: to `owner` while the instance has no owner,
 * which self-hosted setup creates last, else to `done`. Returns whether it moved.
 */
export async function completeImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  const next = (await instanceRepository(tx).readOwnerUserId()) ? "done" : "owner";
  return advanceStep(ctx, tx, "import", next);
}
