import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { Instance } from "../domain";

/**
 * Moves setup between its steps, joining the caller's `tx`. Each move does nothing at any other
 * step and returns whether it moved; completing setup publishes `instance.setup_completed` once.
 */
export interface SetupStepService {
  /** Leaves the company step for the import step. */
  completeCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /**
   * Leaves the import step without approving it, such as for the demo: to `owner` while the
   * instance has no owner, which self-hosted setup creates last, else to `done`.
   */
  completeImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /**
   * Leaves the import step on setup approve: to `owner` while the instance has no owner, else to
   * `ready`, where a managed owner sees what setup added, or to `done` on a self-hosted instance.
   */
  approveImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /** Takes setup from the owner or ready step back to the import step, so the owner can change the review. */
  reopenImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /** Takes setup from `done` back to the company step when an owner with an account exits the demo or resets setup. */
  returnToCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /** Leaves the owner step for `done` once setup created the owner. */
  completeOwnerStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /** Leaves the ready step for `done` once the managed owner has seen what setup added. */
  completeReadyStep(ctx: SecurityContext, tx: Tx): Promise<boolean>;
  /** Whether the import still takes changes: setup has not moved past the import step. Trusted read: no `ctx`. */
  isImportOpen(db: Orm | Tx): Promise<boolean>;
}

export function createSetupStepService(): SetupStepService {
  return {
    completeCompanyStep: (ctx, tx) =>
      changeStep(ctx, tx, (instance) => instance.completeCompanyStep()),
    completeImportStep: (ctx, tx) =>
      changeStep(ctx, tx, (instance) => instance.completeImportStep()),
    approveImportStep: (ctx, tx) => changeStep(ctx, tx, (instance) => instance.approveImportStep()),
    reopenImportStep: (ctx, tx) => changeStep(ctx, tx, (instance) => instance.reopenImportStep()),
    returnToCompanyStep: (ctx, tx) =>
      changeStep(ctx, tx, (instance) => instance.returnToCompanyStep()),
    completeOwnerStep: (ctx, tx) => changeStep(ctx, tx, (instance) => instance.completeOwnerStep()),
    completeReadyStep: (ctx, tx) => changeStep(ctx, tx, (instance) => instance.completeReadyStep()),
    isImportOpen: async (db) => (await instanceRepository(db).readInstance()).isImportOpen(),
  };
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
