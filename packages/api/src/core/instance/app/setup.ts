import type { Orm, Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import type { SetupStep } from "../domain";

/** Where the instance is in its first-run flow, through the pool or joining `tx`. */
export function readSetupStep(db: Orm | Tx): Promise<SetupStep> {
  return instanceRepository(db).readStep();
}

/**
 * Moves the setup step from `from` to `to`, joining `tx`; does nothing at any other
 * step. Returns whether it moved. Reaching `done` publishes `instance.setup_completed`.
 */
export async function advanceStep(
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

/**
 * Takes setup from the owner or ready step back to the company step, joining `tx`; does
 * nothing at any other step. Returns whether it moved.
 */
export async function returnToCompanyStep(ctx: SecurityContext, tx: Tx): Promise<boolean> {
  return (
    (await advanceStep(ctx, tx, "owner", "company")) || advanceStep(ctx, tx, "ready", "company")
  );
}

/** Whether the import still takes changes: setup has not moved past the import step. */
export async function isImportOpen(db: Orm | Tx): Promise<boolean> {
  const step = await readSetupStep(db);
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
  const next = (await instanceRepository(tx).readOwnerUserId()) ? withOwner : "owner";
  return advanceStep(ctx, tx, "import", next);
}
