import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import { instanceRepository } from "../db";
import { AssignmentConflictError, type ManagedAssignment, type OwnerSignInMethod } from "../domain";

/** A managed instance's assignment from the accounts service and its owner's sign-in method. System only. */
export interface ManagedInstanceService {
  /**
   * Stores the assignment once, with the instance's Broccoli AI credential. The same assignment
   * again is accepted, so orchestration can retry after a lost response, and stores the credential
   * it carries; any other assignment is refused, as is one on an instance whose owner was already
   * set up.
   */
  assignInstance(
    ctx: SecurityContext,
    tx: Tx,
    assignment: ManagedAssignment,
    encryptedInstanceCredential: string,
  ): Promise<void>;
  /** Stores how the owner signs in, joining `tx`, unless a method is stored already. */
  recordOwnerSignInMethod(ctx: SecurityContext, tx: Tx, method: OwnerSignInMethod): Promise<void>;
}

export function createManagedInstanceService(): ManagedInstanceService {
  return {
    async assignInstance(ctx, tx, assignment, encryptedInstanceCredential) {
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
    },
    async recordOwnerSignInMethod(ctx, tx, method) {
      ctx.requireSystem();
      await instanceRepository(tx).saveOwnerSignInMethod(method);
    },
  };
}

function isSameAssignment(a: ManagedAssignment, b: ManagedAssignment): boolean {
  return (
    a.companyId === b.companyId &&
    a.publicOrigin === b.publicOrigin &&
    a.websiteOrigin === b.websiteOrigin
  );
}
