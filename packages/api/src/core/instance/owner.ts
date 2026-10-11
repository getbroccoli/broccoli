import { type Orm, ormOf, type Tx } from "../db";
import { instance } from "./schema";

export class OwnerExistsError extends Error {
  constructor() {
    super("The instance already has an owner");
    this.name = "OwnerExistsError";
  }
}

export async function hasOwner(orm: Orm): Promise<boolean> {
  return (await readOwnerUserId(orm)) !== null;
}

/** The owner's user id, or null before setup. */
export async function readOwnerUserId(orm: Orm): Promise<string | null> {
  const [row] = await orm.select({ ownerUserId: instance.ownerUserId }).from(instance);
  return row?.ownerUserId ?? null;
}

/**
 * Makes the user that `createOwner` creates the owner, once per instance. The row
 * lock makes a concurrent claim wait and then fail with `OwnerExistsError`. Publishes
 * `instance.owner_claimed`, however the owner was created.
 */
export async function claimOwner<Owner extends { user: { id: string; email: string } }>(
  tx: Tx,
  createOwner: () => Promise<Owner>,
): Promise<Owner> {
  const db = ormOf(tx);
  const [row] = await db.select({ ownerUserId: instance.ownerUserId }).from(instance).for("update");
  if (!row) {
    throw new Error("The instance row is missing; migrations insert it");
  }
  if (row.ownerUserId) {
    throw new OwnerExistsError();
  }
  const owner = await createOwner();
  await db.update(instance).set({ ownerUserId: owner.user.id, onboardingStep: "company" });
  tx.publish("instance.owner_claimed", { userId: owner.user.id, email: owner.user.email });
  return owner;
}
