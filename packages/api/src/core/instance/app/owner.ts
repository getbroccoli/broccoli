import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { holdsSetup, OwnerExistsError, SetupInProgressError, type SetupStep } from "../domain";
import { completeOwnerStep } from "./setup";

/** The owner's user id, or null before setup. */
export function readOwnerUserId(db: Orm | Tx): Promise<string | null> {
  return instanceRepository(db).readOwnerUserId();
}

export async function hasOwner(orm: Orm): Promise<boolean> {
  return (await readOwnerUserId(orm)) !== null;
}

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
  const { ownerUserId, step } = await instance.lockSetup();
  if (ownerUserId) {
    throw new OwnerExistsError();
  }
  return saveOwner(tx, await createOwner(), step);
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
  const step = await lockHeldSetup(tx, { token, now });
  if (step !== "owner") {
    throw new ApplicationError("CONFLICT", "Finish the import before creating the owner.");
  }
  const owner = await saveOwner(tx, await createOwner(), step);
  await completeOwnerStep(ctx, tx);
  await instance.clearSetupSession();
  return owner;
}

/**
 * Locks the instance row for the browser holding setup before an owner exists and returns
 * the step; refuses with `OwnerExistsError` or `SetupInProgressError`.
 */
export async function lockHeldSetup(
  tx: Tx,
  { token, now }: { token: string | null; now: Date },
): Promise<SetupStep> {
  const { ownerUserId, step, setupSession } = await instanceRepository(tx).lockSetup();
  if (ownerUserId) {
    throw new OwnerExistsError();
  }
  if (!setupSession || !holdsSetup(setupSession, token, now)) {
    throw new SetupInProgressError();
  }
  return step;
}

export interface OwnerUser {
  user: { id: string; email: string };
}

/** Makes `owner` the instance's owner at `step` and publishes `instance.owner_claimed`. */
export async function saveOwner<Owner extends OwnerUser>(
  tx: Tx,
  owner: Owner,
  step: SetupStep,
): Promise<Owner> {
  await instanceRepository(tx).setOwner(owner.user.id, step);
  tx.publish("instance.owner_claimed", { userId: owner.user.id, email: owner.user.email });
  return owner;
}
