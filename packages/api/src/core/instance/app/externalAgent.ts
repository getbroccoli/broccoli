import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import {
  type ExternalAgentSetupFacts,
  canChooseExternalAgent,
  isSetupOpenToExternalAgent,
} from "../domain";

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
  if (!canChooseExternalAgent(await lockExternalAgentFacts(tx))) {
    throw new ApplicationError(
      "CONFLICT",
      "Your agent can connect only while you gather your people.",
    );
  }
}

/** Whether the external agent may work now (`isSetupOpenToExternalAgent`). */
export async function readSetupOpenToExternalAgent(db: Orm | Tx, now: Date): Promise<boolean> {
  const instance = instanceRepository(db);
  const [ownerUserId, step, setupSession, { source }, assignment] = await Promise.all([
    instance.readOwnerUserId(),
    instance.readStep(),
    instance.readSetupSession(),
    instance.readAiSource(),
    instance.readAssignment(),
  ]);
  return isSetupOpenToExternalAgent(
    { isManaged: assignment !== null, ownerUserId, step, setupSession, aiSource: source },
    now,
  );
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
  const facts = await lockExternalAgentFacts(tx);
  const now = clock();
  return isSetupOpenToExternalAgent(facts, now) ? now : null;
}

async function lockExternalAgentFacts(tx: Tx): Promise<ExternalAgentSetupFacts> {
  const instance = instanceRepository(tx);
  const { ownerUserId, step, setupSession } = await instance.lockSetup();
  const { source } = await instance.readAiSource();
  const isManaged = (await instance.readAssignment()) !== null;
  return { isManaged, ownerUserId, step, setupSession, aiSource: source };
}
