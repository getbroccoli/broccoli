import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";
import { createSetupStepService } from "./setupStepService";

/**
 * Adds the people the owner approved in the caller's transaction, so they arrive together
 * with the end of setup. The imports module provides it.
 */
export type AddApprovedPeople = (ctx: SecurityContext, tx: Tx) => Promise<void>;

export interface OwnerUser {
  user: { id: string; email: string };
}

/** The instance's owner, claimed once; claiming publishes `instance.owner_claimed`. */
export interface OwnerService {
  /** The owner's id and sign-in email, or null before an owner exists. Trusted read: no `ctx`. */
  readOwner(db: Orm | Tx): Promise<{ userId: string; email: string } | null>;
  /**
   * Makes the user that `createOwner` creates the owner, once per instance, keeping the
   * setup step. The row lock makes a concurrent claim wait and then fail with
   * `OwnerExistsError`.
   */
  claimOwner<Owner extends OwnerUser>(
    ctx: SecurityContext,
    tx: Tx,
    createOwner: () => Promise<Owner>,
  ): Promise<Owner>;
  /**
   * The last step of self-hosted setup: makes the user that `createOwner` creates the
   * owner, for the browser holding setup only, adds the approved people, then completes
   * setup and ends the setup session. Refuses with `OwnerExistsError`,
   * `SetupInProgressError`, or CONFLICT before the owner step.
   */
  createOwnerAtSetup<Owner extends OwnerUser>(
    ctx: SecurityContext,
    tx: Tx,
    session: { token: string | null; now: Date },
    createOwner: () => Promise<Owner>,
    addApprovedPeople: AddApprovedPeople,
  ): Promise<Owner>;
}

export function createOwnerService(): OwnerService {
  const setupSteps = createSetupStepService();
  return {
    readOwner: (db) => instanceRepository(db).readOwner(),
    async claimOwner(ctx, tx, createOwner) {
      ctx.requireSystem();
      const current = await instanceRepository(tx).lockInstance();
      current.requireUnclaimedOwner();
      return saveOwner(tx, await createOwner(), current);
    },
    async createOwnerAtSetup(ctx, tx, session, createOwner, addApprovedPeople) {
      ctx.requireSystem();
      const current = await lockHeldSetup(tx, session);
      if (current.step !== "owner") {
        throw new ApplicationError("CONFLICT", "Finish the import before creating the owner.");
      }
      const owner = await saveOwner(tx, await createOwner(), current);
      await addApprovedPeople(ctx, tx);
      await setupSteps.completeOwnerStep(ctx, tx);
      await instanceRepository(tx).clearSetupSession();
      return owner;
    },
  };
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
