import { ApplicationError } from "../../applicationError";
import type { SecurityContext } from "../../security";
import { AGENT_WRITE_SCOPE } from "../domain";

/**
 * Refuses a connected agent whose person allowed it only to read; a browser passes. Shared writes
 * call it, so a tool that forgets its scope still cannot change anything.
 */
export function requireAgentWriteScope(ctx: SecurityContext): void {
  if (ctx.agentConnection && !ctx.agentConnection.scopes.has(AGENT_WRITE_SCOPE)) {
    throw new ApplicationError("FORBIDDEN", "Allow your agent to change things in Broccoli first.");
  }
}
