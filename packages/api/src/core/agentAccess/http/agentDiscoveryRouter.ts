import express from "express";

import { type AuthSource, authHandler } from "../../auth";
import { AGENT_SCOPES, agentResourceOf, MCP_PATH } from "../domain";

/**
 * Where agents find out how to connect: the MCP server's protected resource metadata, and the
 * OAuth server's metadata at the address MCP clients derive from its issuer, `/api/auth`.
 */
export function agentDiscoveryRouter(
  auth: AuthSource,
  publicOrigin: (request: express.Request) => Promise<string>,
): express.Router {
  return express
    .Router()
    .get(
      [`/.well-known/oauth-protected-resource${MCP_PATH}`, "/.well-known/oauth-protected-resource"],
      async (request, response) => {
        const origin = await publicOrigin(request);
        response.set("Cache-Control", "no-store").json({
          resource: agentResourceOf(origin),
          authorization_servers: [`${origin}/api/auth`],
          scopes_supported: [...AGENT_SCOPES, "offline_access"],
          bearer_methods_supported: ["header"],
        });
      },
    )
    .get("/.well-known/oauth-authorization-server/api/auth", authHandler(auth));
}
