import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { SetupStep } from "../domain";

/** Leaves the company step for the import step, joining `tx`; does nothing at any other step. Returns whether it moved. */
export function completeCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return advanceStep(ctx, tx, "company", "import");
}

/**
 * Leaves the ready step for `done` once the managed owner has seen what setup added, joining
 * `tx`; does nothing at any other step. Returns whether it moved.
 */
export function completeReadyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return advanceStep(ctx, tx, "ready", "done");
}

/** Leaves the owner step for `done` once setup created the owner, joining `tx`. */
export function completeOwnerStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return advanceStep(ctx, tx, "owner", "done");
}

/**
 * Takes setup from the owner or ready step back to the company step, joining `tx`; does
 * nothing at any other step. Returns whether it moved.
 */
export async function returnToCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return (
    (await advanceStep(ctx, tx, "owner", "company")) || advanceStep(ctx, tx, "ready", "company")
  );
}

/**
 * Takes setup from `done` back to the company step when an owner with an account exits the
 * demo, joining `tx`; does nothing at any other step. Returns whether it moved.
 */
export function returnToCompanyStepFromDemo(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return advanceStep(ctx, tx, "done", "company");
}

/** Whether the import still takes changes: setup has not moved past the import step. */
export async function isImportOpen(db: Orm | Tx): Promise<boolean> {
  const { step } = await instanceRepository(db).readInstance();
  return step === "company" || step === "import";
}

/**
 * Leaves the import step without approving it, such as for the demo, joining `tx`: to
 * `owner` while the instance has no owner, which self-hosted setup creates last, else to
 * `done`. Returns whether it moved.
 */
export async function completeImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return leaveImportStep(ctx, tx, "done");
}

/**
 * Leaves the import step on setup approve, joining `tx`: to `owner` while the instance has
 * no owner, else to `ready`, where a managed owner sees what setup added. Returns whether
 * it moved.
 */
export async function approveImportStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return leaveImportStep(ctx, tx, "ready");
}

async function leaveImportStep(
  ctx: SecurityContext,
  tx: Tx,
  withOwner: SetupStep,
): Promise<boolean> {
  const { ownerUserId } = await instanceRepository(tx).readInstance();
  const next = ownerUserId ? withOwner : "owner";
  return advanceStep(ctx, tx, "import", next);
}

/**
 * Moves the setup step from `from` to `to`, joining `tx`; does nothing at any other
 * step. Returns whether it moved. Reaching `done` publishes `instance.setup_completed`.
 */
async function advanceStep(
  ctx: SecurityContext,
  tx: Tx,
  from: SetupStep,
  to: SetupStep,
): Promise<boolean> {
  ctx.requireSetupAccess();
  const moved = await instanceRepository(tx).advanceStep(from, to);
  if (moved && to === "done") {
    tx.publish("instance.setup_completed", null);
  }
  return moved;
}
