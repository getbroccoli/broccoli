import type { Orm, OrmTransaction } from "../db";
import { instance } from "./schema";

export class OwnerExistsError extends Error {
  constructor() {
    super("The instance already has an owner");
    this.name = "OwnerExistsError";
  }
}

export async function hasOwner(orm: Orm): Promise<boolean> {
  const [row] = await orm.select({ ownerUserId: instance.ownerUserId }).from(instance);
  return Boolean(row?.ownerUserId);
}

/**
 * Makes the user that `createOwner` creates the owner, once per instance. The row
 * lock makes a concurrent claim wait and then fail with `OwnerExistsError`.
 */
export async function claimOwner<Owner extends { user: { id: string } }>(
  tx: OrmTransaction,
  createOwner: () => Promise<Owner>,
): Promise<Owner> {
  const [row] = await tx.select({ ownerUserId: instance.ownerUserId }).from(instance).for("update");
  if (!row) {
    throw new Error("The instance row is missing; migrations insert it");
  }
  if (row.ownerUserId) {
    throw new OwnerExistsError();
  }
  const owner = await createOwner();
  await tx.update(instance).set({ ownerUserId: owner.user.id, onboardingStep: "company" });
  return owner;
}
