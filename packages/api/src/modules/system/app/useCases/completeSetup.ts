import { ApplicationError } from "../../../../core/applicationError";
import { completeReadyStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import type { SystemContext } from "./systemContext";

/**
 * Completes a managed setup once the owner has seen what it will add: adds the approved
 * people and publishes `instance.setup_completed`, in one transaction. Refused at any step
 * but `ready`, such as after another tab went back to the review.
 */
export async function completeSetup(
  { transact, addApprovedPeople }: Pick<SystemContext, "transact" | "addApprovedPeople">,
  ctx: SecurityContext,
): Promise<void> {
  await transact(async (tx) => {
    if (!(await completeReadyStep(ctx, tx))) {
      throw new ApplicationError("CONFLICT", "Setup is not at the ready step.");
    }
    await addApprovedPeople(ctx, tx);
  });
}
