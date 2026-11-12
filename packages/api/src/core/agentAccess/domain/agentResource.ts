/** What a person allows their agent: to read, and later to change, what they themselves may. */
export const AGENT_SCOPES = ["broccoli:read", "broccoli:write"] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

/** Where agents call Broccoli's MCP server. */
export const MCP_PATH = "/api/mcp";

/** The web app's page where a person allows their agent. */
export const ALLOW_AGENT_PAGE = "/agent/allow";

/** The OAuth resource an agent's token must name: the MCP server at the instance's address. */
export function agentResourceOf(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/** Where an agent reads how to get a token for the MCP server at `origin`. */
export function agentResourceMetadataOf(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}
