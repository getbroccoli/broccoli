import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { AssignmentConflictError, type ManagedAssignment, type OwnerSignInMethod } from "../domain";

/**
 * Stores the assignment once, with the instance's Broccoli AI credential. The same assignment
 * again is accepted, so orchestration can retry after a lost response, and stores the credential
 * it carries; any other assignment is refused, as is one on an instance whose owner was already
 * set up.
 */
export async function assignInstance(
  ctx: SecurityContext,
  tx: Tx,
  assignment: ManagedAssignment,
  encryptedInstanceCredential: string,
): Promise<void> {
  ctx.requireSystem();
  const instance = instanceRepository(tx);
  const current = await instance.lockInstance();
  if (current.assignment) {
    if (!isSameAssignment(current.assignment, assignment)) {
      throw new AssignmentConflictError();
    }
  } else if (current.ownerUserId) {
    throw new AssignmentConflictError();
  } else {
    await instance.setAssignment(assignment);
  }
  await instance.saveInstanceCredential(encryptedInstanceCredential);
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
  ctx.requireSystem();
  await instanceRepository(tx).saveOwnerSignInMethod(method);
}
