import type { SecurityContext } from "../../security";

/**
 * The user whose own agent the caller's reads are about; null for anyone else, and while acting
 * as another employee, since an agent connection stays its own user's credential.
 */
export function agentUserOf(ctx: SecurityContext): string | null {
  return ctx.user && !ctx.actor ? ctx.user.userId : null;
}
