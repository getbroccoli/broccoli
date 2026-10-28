import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";

/** Leaves the company step for the import step, joining `tx`; does nothing at any other step. Returns whether it moved. */
export function completeCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.completeCompanyStep());
}

/**
 * Leaves the ready step for `done` once the managed owner has seen what setup added, joining
 * `tx`; does nothing at any other step. Returns whether it moved.
 */
export function completeReadyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.completeReadyStep());
}

/** Leaves the owner step for `done` once setup created the owner, joining `tx`. */
export function completeOwnerStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.completeOwnerStep());
}

/**
 * Takes setup from the owner or ready step back to the import step, so the owner can change
 * the review, joining `tx`; does nothing at any other step. Returns whether it moved.
 */
export function reopenImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.reopenImportStep());
}

/**
 * Takes setup from `done` back to the company step when an owner with an account exits the
 * demo or resets setup, joining `tx`; does nothing at any other step. Returns whether it moved.
 */
export function returnToCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.returnToCompanyStep());
}

/** Whether the import still takes changes: setup has not moved past the import step. */
export async function isImportOpen(db: Orm | Tx): Promise<boolean> {
  return (await instanceRepository(db).readInstance()).isImportOpen();
}

/**
 * Leaves the import step without approving it, such as for the demo, joining `tx`: to
 * `owner` while the instance has no owner, which self-hosted setup creates last, else to
 * `done`. Returns whether it moved.
 */
export async function completeImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.completeImportStep());
}

/**
 * Leaves the import step on setup approve, joining `tx`: to `owner` while the instance has
 * no owner, else to `ready`, where a managed owner sees what setup added, or to `done` on a
 * self-hosted instance. Returns whether it moved.
 */
export async function approveImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return changeStep(ctx, tx, (instance) => instance.approveImportStep());
}

/** Locks the instance before deciding its next step; completing setup publishes its event once. */
async function changeStep(
  ctx: SecurityContext,
  tx: Tx,
  change: (instance: Instance) => Instance | null,
): Promise<boolean> {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
  const repository = instanceRepository(tx);
  const current = await repository.lockInstance();
  const next = change(current);
  if (!next) {
    return false;
  }
  const moved = await repository.advanceStep(current.step, next.step);
  if (moved && next.step === "done") {
    tx.publish("instance.setup_completed", null);
  }
  return moved;
}
