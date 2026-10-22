import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { AssignmentConflictError, type ManagedAssignment, type OwnerSignInMethod } from "../domain";

/**
 * Stores the assignment once. The same assignment again is accepted, so orchestration
 * can retry after a lost response; any other assignment is refused, as is one on an
 * instance whose owner was already set up.
 */
export async function assignInstance(
  ctx: SecurityContext,
  tx: Tx,
  assignment: ManagedAssignment,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  const instance = instanceRepository(tx);
  const current = await instance.lockInstance();
  if (current.assignment) {
    if (!isSameAssignment(current.assignment, assignment)) {
      throw new AssignmentConflictError();
    }
    return;
  }
  if (current.ownerUserId) {
    throw new AssignmentConflictError();
  }
  await instance.setAssignment(assignment);
}

function isSameAssignment(a: ManagedAssignment, b: ManagedAssignment): boolean {
  return (
    a.companyId === b.companyId &&
    a.publicOrigin === b.publicOrigin &&
    a.websiteOrigin === b.websiteOrigin
  );
}

/** Stores how the owner signs in, joining `tx`, unless a method is stored already. */
export async function recordOwnerSignInMethod(
  ctx: SecurityContext,
  tx: Tx,
  method: OwnerSignInMethod,
): Promise<void> {
  ctx.requireOwnerOrSystem();
  await instanceRepository(tx).saveOwnerSignInMethod(method);
}
