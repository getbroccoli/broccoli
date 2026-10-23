import { ApplicationError } from "../../applicationError";
import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { demoExpiry } from "../domain";
import { lockHeldSetup, type OwnerUser, saveOwner } from "./owner";
import { newSetupToken, saveSetupSession } from "./setupSession";

/**
 * The demo company's start in the caller's transaction: it completes the import step and
 * fills the demo company. The imports module provides it.
 */
export type DemoStart = (ctx: SecurityContext, tx: Tx) => Promise<void>;

/**
 * Deletes every employee in the caller's transaction when the demo is reset; during the demo
 * they are the demo company and anyone added to it. The employees module provides it.
 */
export type DemoReset = (ctx: SecurityContext, tx: Tx) => Promise<void>;

/** What self-hosted setup needs from the modules for the demo. */
export interface SetupDemo {
  /** The demo company's start, run when setup starts the demo. */
  prepareStart: () => Promise<DemoStart>;
  /** Run when the demo's owner resets setup. */
  deleteAllEmployees: DemoReset;
}

/**
 * Starts the demo for the browser holding self-hosted setup at the `import` step: makes the
 * user that `createOwner` creates the provisional owner, runs `startDemo`, which completes
 * setup now that an owner exists, gives the demo its deadline and ends the setup session.
 * Refuses with `OwnerExistsError`, `SetupInProgressError`, or CONFLICT at another step.
 */
export async function startDemoAtSetup<Owner extends OwnerUser>(
  ctx: SecurityContext,
  tx: Tx,
  { token, now }: { token: string | null; now: Date },
  createOwner: () => Promise<Owner>,
  startDemo: DemoStart,
): Promise<Owner> {
  ctx.requireOwnerOrSystem();
  const current = await lockHeldSetup(tx, { token, now });
  if (current.step !== "import") {
    throw new ApplicationError("CONFLICT", "Name the company before starting the demo.");
  }
  const owner = await saveOwner(tx, await createOwner(), current);
  await startDemo(ctx, tx);
  const instance = instanceRepository(tx);
  await instance.saveDemoExpiresAt(demoExpiry(now));
  await instance.clearSetupSession();
  return owner;
}

/**
 * Ends the demo for its provisional owner before the deadline and takes setup back to the
 * company step: runs `clearPeople`, removes the owner and its deadline, runs `deleteOwner`,
 * which deletes the provisional user, and gives this browser a new setup session, returned
 * for its cookie. The company and the AI source stay. Refuses with FORBIDDEN anyone else,
 * after the deadline, or without a demo.
 */
export async function exitDemo(
  ctx: SecurityContext,
  tx: Tx,
  { userId, now }: { userId: string; now: Date },
  { clearPeople, deleteOwner }: { clearPeople: DemoReset; deleteOwner: () => Promise<void> },
): Promise<{ token: string; expiresAt: Date }> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  const exited = (await instance.lockInstance()).exitDemo(userId, now);
  await clearPeople(ctx, tx);
  // The instance row references the user, so it lets go before the user is deleted.
  await instance.clearOwner(exited.step);
  await instance.saveDemoExpiresAt(exited.demoExpiresAt);
  await deleteOwner();
  return saveSetupSession(tx, newSetupToken(), now);
}
