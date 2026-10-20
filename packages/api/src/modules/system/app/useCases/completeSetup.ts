import { advanceStep } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import type { SystemContext } from "./systemContext";

/**
 * Completes a managed setup once the owner has seen what it added, which publishes
 * `instance.setup_completed`; at any step but `ready` it does nothing.
 */
export async function completeSetup(
  { transact }: Pick<SystemContext, "transact">,
  ctx: SecurityContext,
): Promise<void> {
  await transact((tx) => advanceStep(ctx, tx, "ready", "done"));
}
