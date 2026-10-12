import type { Orm, Tx } from "../../db";
import { instanceRepository } from "../db";
import { OwnerExistsError } from "../domain";

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
 * Makes the user that `createOwner` creates the owner, once per instance. The row
 * lock makes a concurrent claim wait and then fail with `OwnerExistsError`. Publishes
 * `instance.owner_claimed`, however the owner was created.
 */
export async function claimOwner<Owner extends { user: { id: string; email: string } }>(
  tx: Tx,
  createOwner: () => Promise<Owner>,
): Promise<Owner> {
  const instance = instanceRepository(tx);
  if (await instance.lockOwnerUserId()) {
    throw new OwnerExistsError();
  }
  const owner = await createOwner();
  await instance.setOwner(owner.user.id, "company");
  tx.publish("instance.owner_claimed", { userId: owner.user.id, email: owner.user.email });
  return owner;
}
