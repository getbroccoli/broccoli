import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";
import { completeOwnerStep } from "./setup";

/** The owner's id and sign-in email, or null before an owner exists. */
export function readOwner(orm: Orm): Promise<{ userId: string; email: string } | null> {
  return instanceRepository(orm).readOwner();
}

/**
 * Makes the user that `createOwner` creates the owner, once per instance, keeping the
 * setup step. The row lock makes a concurrent claim wait and then fail with
 * `OwnerExistsError`. Publishes `instance.owner_claimed`.
 */
export async function claimOwner<Owner extends OwnerUser>(
  ctx: SecurityContext,
  tx: Tx,
  createOwner: () => Promise<Owner>,
): Promise<Owner> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  const current = await instance.lockInstance();
  current.requireUnclaimedOwner();
  return saveOwner(tx, await createOwner(), current);
}

/**
 * The last step of self-hosted setup: makes the user that `createOwner` creates the
 * owner, for the browser holding setup only, then completes setup and ends the setup
 * session. Refuses with `OwnerExistsError`, `SetupInProgressError`, or CONFLICT before
 * the owner step.
 */
export async function createOwnerAtSetup<Owner extends OwnerUser>(
  ctx: SecurityContext,
  tx: Tx,
  { token, now }: { token: string | null; now: Date },
  createOwner: () => Promise<Owner>,
): Promise<Owner> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  const current = await lockHeldSetup(tx, { token, now });
  if (current.step !== "owner") {
    throw new ApplicationError("CONFLICT", "Finish the import before creating the owner.");
  }
  const owner = await saveOwner(tx, await createOwner(), current);
  await completeOwnerStep(ctx, tx);
  await instance.clearSetupSession();
  return owner;
}

/**
 * Locks the instance row for the browser holding setup before an owner exists and returns
 * the instance; refuses with `OwnerExistsError` or `SetupInProgressError`.
 */
export async function lockHeldSetup(
  tx: Tx,
  { token, now }: { token: string | null; now: Date },
): Promise<Instance> {
  const current = await instanceRepository(tx).lockInstance();
  current.requireHeldSetup(token, now);
  return current;
}

export interface OwnerUser {
  user: { id: string; email: string };
}

/** Makes `owner` the instance's owner at its current step and publishes `instance.owner_claimed`. */
export async function saveOwner<Owner extends OwnerUser>(
  tx: Tx,
  owner: Owner,
  current: Instance,
): Promise<Owner> {
  const claimed = current.claimOwner(owner.user.id);
  await instanceRepository(tx).setOwner(claimed.ownerUserId!, claimed.step);
  tx.publish("instance.owner_claimed", { userId: owner.user.id, email: owner.user.email });
  return owner;
}
