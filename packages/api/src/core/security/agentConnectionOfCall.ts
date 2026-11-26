import { ApplicationError } from "../applicationError";
import type { SecurityContext } from "./securityContext";

/** A connected agent acting for its person: its connection and the scopes its token holds. */
export interface AgentConnectionOfCall {
  id: string;
  scopes: ReadonlySet<string>;
}

/** The scope that lets an agent change things, not only read. */
export const AGENT_WRITE_SCOPE = "broccoli:write";

/**
 * Refuses a connected agent whose person allowed it only to read; a browser passes. Shared writes
 * call it, so a tool that forgets its scope still cannot change anything.
 */
export function requireAgentWriteScope(ctx: SecurityContext): void {
  if (ctx.agentConnection && !ctx.agentConnection.scopes.has(AGENT_WRITE_SCOPE)) {
    throw new ApplicationError("FORBIDDEN", "Allow your agent to change things in Broccoli first.");
  }
}
