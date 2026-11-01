import { ApplicationError } from "../../../../core/applicationError";
import { completeReadyStep, type SetupChoices, type SetupInvite } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import type { SystemContext } from "./systemContext";

/**
 * Completes a managed setup once the owner has seen what it will add: adds the approved
 * people, links the owner to their person, sends the invites they chose and publishes
 * `instance.setup_completed`, in one transaction. Returns the invites. Refused at any step but
 * `ready`, such as after another tab went back to the review.
 */
export async function completeSetup(
  { transact, addApprovedPeople }: Pick<SystemContext, "transact" | "addApprovedPeople">,
  ctx: SecurityContext,
  choices: SetupChoices & { linkOrigin: string },
): Promise<SetupInvite[]> {
  return transact(async (tx) => {
    if (!(await completeReadyStep(ctx, tx))) {
      throw new ApplicationError("CONFLICT", "Setup is not at the ready step.");
    }
    // Only a signed-in owner reaches the ready step.
    return addApprovedPeople(ctx, tx, { ...choices, ownerUserId: ctx.user!.userId });
  });
}
