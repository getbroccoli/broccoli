import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { SetupStep } from "../domain";

/** Where the instance is in its first-run flow. */
export function readSetupStep(orm: Orm): Promise<SetupStep> {
  return instanceRepository(orm).readStep();
}

/**
 * Moves the setup step from `from` to `to`, joining `tx`; does nothing at any other
 * step. Reaching `done` publishes `instance.setup_completed`.
 */
export async function advanceStep(
  ctx: SecurityContext,
  tx: Tx,
  from: SetupStep,
  to: SetupStep,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  const moved = await instanceRepository(tx).advanceStep(from, to);
  if (moved && to === "done") {
    tx.publish("instance.setup_completed", null);
  }
}
