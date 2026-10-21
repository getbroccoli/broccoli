import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { canChooseExternalAgent, isSetupOpenToExternalAgent } from "../domain";

/**
 * Makes the owner's external agent the AI source, in the caller's `tx` and holding the instance
 * row; refused like `lockExternalAgentChoice`.
 */
export async function chooseExternalAgentSource(ctx: SecurityContext, tx: Tx): Promise<void> {
  await lockExternalAgentChoice(ctx, tx);
  await instanceRepository(tx).storeAiSource("external_agent");
}

/**
 * Holds the instance row until `tx` ends for a change to the external agent; refused with
 * CONFLICT on a managed instance, once the owner exists or outside the import step.
 */
export async function lockExternalAgentChoice(ctx: SecurityContext, tx: Tx): Promise<void> {
  ctx.requireSetupAccess();
  if (!canChooseExternalAgent(await instanceRepository(tx).lock())) {
    throw new ApplicationError(
      "CONFLICT",
      "Your agent can connect only while you gather your people.",
    );
  }
}

/** Whether the external agent may work now (`isSetupOpenToExternalAgent`). */
export async function readSetupOpenToExternalAgent(db: Orm | Tx, now: Date): Promise<boolean> {
  return isSetupOpenToExternalAgent(await instanceRepository(db).read(), now);
}

/**
 * Holds the instance row until `tx` ends, so a step move or another AI source cannot land before
 * the caller's write, then reads `clock`: that moment when the external agent may work then, else
 * null. Read after the wait for the lock, so no deadline passes unseen meanwhile.
 */
export async function lockSetupOpenToExternalAgent(
  tx: Tx,
  clock: () => Date,
): Promise<Date | null> {
  const instance = await instanceRepository(tx).lock();
  const now = clock();
  return isSetupOpenToExternalAgent(instance, now) ? now : null;
}
