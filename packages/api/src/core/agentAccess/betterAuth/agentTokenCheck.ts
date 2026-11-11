import type { GenericEndpointContext } from "@better-auth/core";
import { getOAuthProviderApi, type OAuthOptions, type Scope } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import type { IncomingHttpHeaders } from "node:http";

import { type Auth, type AuthSource, user } from "../../auth";
import type { Orm } from "../../db";
import { resolveUserSecurity } from "../../instance";
import type { EmployeeDirectory, SecurityContext } from "../../security";
import { agentResourceOf } from "../domain";

/** Who an agent's call acts as, and what it was allowed; or why it was refused. */
export type AgentSecurity =
  { security: SecurityContext; scopes: ReadonlySet<string> } | { refusal: AgentRefusal };

/** Why an agent's call was refused before it ran. */
export type AgentRefusal =
  | "NO_TOKEN"
  | "INVALID_TOKEN"
  | "TOKEN_FOR_OTHER_RESOURCE"
  | "SENDER_CONSTRAINED_TOKEN"
  | "DEMO_ENDED";

/** Checks the bearer token of an agent's call to the MCP server at `origin`. */
export type AgentSecurityResolver = (
  headers: IncomingHttpHeaders,
  origin: string,
) => Promise<AgentSecurity>;

/**
 * Checks tokens in the database on every call, so a connection ended a moment ago is refused, and
 * resolves the person's permissions afresh, as for their browser.
 */
export function agentSecurityResolver(
  authSource: AuthSource,
  orm: Orm,
  directory: EmployeeDirectory,
): AgentSecurityResolver {
  return async (headers, origin) => {
    const token = bearerTokenOf(headers);
    const auth = await authSource.current();
    if (!token || !auth) {
      return { refusal: "NO_TOKEN" };
    }
    const claims = await activeClaimsOf(await auth.$context, token);
    if (!claims) {
      return { refusal: "INVALID_TOKEN" };
    }
    if (!audiencesOf(claims.aud).includes(agentResourceOf(origin))) {
      return { refusal: "TOKEN_FOR_OTHER_RESOURCE" };
    }
    // Bound to a key whose proofs Broccoli does not check, so it must not count as a bearer.
    if (claims.cnf !== undefined) {
      return { refusal: "SENDER_CONSTRAINED_TOKEN" };
    }
    const [person] = await orm
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, String(claims.sub)));
    const security = person ? await resolveUserSecurity(orm, directory, person) : null;
    if (!security) {
      return { refusal: person ? "DEMO_ENDED" : "INVALID_TOKEN" };
    }
    const scope = typeof claims.scope === "string" ? claims.scope : "";
    return { security, scopes: new Set(scope.split(" ")) };
  };
}

function bearerTokenOf(headers: IncomingHttpHeaders): string | null {
  const [scheme, token] = (headers.authorization ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** The claims of an active access token; null for an unknown, expired or revoked one. */
async function activeClaimsOf(
  context: Awaited<Auth["$context"]>,
  token: string,
): Promise<Record<string, unknown> | null> {
  const options: OAuthOptions<Scope[]> = context.getPlugin("oauth-provider")!.options;
  // The provider's checks need only the auth context of an endpoint, which this call has none of.
  const endpoint = { context } as unknown as GenericEndpointContext;
  const provider = getOAuthProviderApi(endpoint, options);
  try {
    return await provider.requireActiveAccessToken(token);
  } catch (error) {
    if (isUnauthorized(error)) {
      return null;
    }
    throw error;
  }
}

function isUnauthorized(error: unknown): boolean {
  return (error as { statusCode?: unknown } | null)?.statusCode === 401;
}

function audiencesOf(aud: unknown): unknown[] {
  return Array.isArray(aud) ? aud : [aud];
}
