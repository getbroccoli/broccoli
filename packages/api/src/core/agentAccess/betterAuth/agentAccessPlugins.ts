import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { oauthProvider } from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";

import { PrincipalSecurityContext } from "../../security";
import type { AgentConnectionService } from "../app";
import { AGENT_SCOPES, agentResourceOf, ALLOW_AGENT_PAGE, type AgentScope } from "../domain";

/** Allowed only once a tool changes something. */
const WRITE_SCOPE: AgentScope = "broccoli:write";

/** Long enough for an agent's sign-in and Allow; the OAuth default. */
const ACCESS_TOKEN_SECONDS = 60 * 60;
/** A retried refresh within this window gets the same answer instead of ending the connection. */
const REFRESH_REUSE_SECONDS = 30;

/**
 * Better Auth as the OAuth server people's own agents connect through: public clients only, by
 * dynamic registration or a client metadata document, PKCE, opaque tokens checked in the
 * database on every call, and one connection per person.
 */
export function agentAccessPlugins(connections: AgentConnectionService): BetterAuthPlugin[] {
  return [
    oauthProvider({
      loginPage: "/login",
      consentPage: ALLOW_AGENT_PAGE,
      disableJwtPlugin: true,
      scopes: [...AGENT_SCOPES, "offline_access"],
      grantTypes: ["authorization_code", "refresh_token"],
      // Resource rows are added for the address an agent finds Broccoli at, so no client is
      // linked to them in advance.
      enforcePerClientResources: false,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
      refreshTokenReuseInterval: REFRESH_REUSE_SECONDS,
      // Nobody manages OAuth clients or resources from the browser.
      clientPrivileges: () => false,
      resourcePrivileges: () => false,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    agentConnectionPolicy(connections),
  ];
}

/** Broccoli's rules on top of the OAuth provider. */
function agentConnectionPolicy(connections: AgentConnectionService): BetterAuthPlugin {
  const system = PrincipalSecurityContext.system();
  return {
    id: "agent-connection-policy",
    init: () => ({
      options: {
        emailAndPassword: {
          // Merged into the instance's own password sign-in, which is always on.
          enabled: true,
          // A reset may follow a stolen password, so it ends the agent's access as well.
          onPasswordReset: ({ user }) =>
            connections.endConnections(system, { userId: user.id, reason: "PASSWORD_RESET" }),
        },
      },
    }),
    hooks: {
      before: policyBeforeHooks(connections),
      after: [
        {
          matcher: (ctx) =>
            ctx.path === "/oauth2/consent" &&
            (ctx.body as ConsentBody | undefined)?.accept === true,
          handler: createAuthMiddleware(async (ctx) => {
            const { oauth_query: query } = ctx.body as ConsentBody;
            const userId = ctx.context.session?.user.id;
            const clientId =
              typeof query === "string" ? new URLSearchParams(query).get("client_id") : null;
            if (userId && clientId && grantedCode(ctx.context.returned)) {
              await connections.keepOnlyConnection(system, { userId, clientId });
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

/**
 * Before the provider acts: public clients only, no widening of a consent outside Allow, read
 * only for now, the resource at this address, and tokens detached from expired browser sessions.
 */
function policyBeforeHooks(connections: AgentConnectionService) {
  const system = PrincipalSecurityContext.system();
  return [
    {
      matcher: (ctx) => ctx.path === "/oauth2/register",
      handler: createAuthMiddleware((ctx) =>
        Promise.resolve({ context: { body: publicClientRegistration(ctx.body) } }),
      ),
    },
    {
      // A person changes what their agent may do only by allowing it again.
      matcher: (ctx) => ctx.path === "/oauth2/update-consent",
      handler: createAuthMiddleware(() => {
        throw new APIError("FORBIDDEN", {
          message: "Allow the agent again to change its access",
        });
      }),
    },
    {
      matcher: (ctx) => ctx.path === "/oauth2/consent",
      handler: createAuthMiddleware((ctx) =>
        Promise.resolve({ context: { body: readOnlyConsent(ctx.body) } }),
      ),
    },
    {
      // The resource is the MCP server at the address the agent reached Broccoli at.
      matcher: (ctx) => ctx.path === "/oauth2/authorize",
      handler: createAuthMiddleware((ctx) =>
        connections.ensureAgentResource(
          system,
          agentResourceOf(new URL(ctx.context.baseURL).origin),
        ),
      ),
    },
    {
      matcher: (ctx) => ctx.path === "/oauth2/token",
      handler: createAuthMiddleware(() => connections.detachExpiredSessions(system)),
    },
  ] satisfies NonNullable<BetterAuthPlugin["hooks"]>["before"];
}

/** What the Allow page posts; the provider has checked the query's signature by now. */
interface ConsentBody {
  accept?: unknown;
  oauth_query?: unknown;
}

/**
 * The registration as a public client, which proves itself by PKCE alone; a client on a loopback
 * address is a native app, which may then use any port there.
 */
function publicClientRegistration(body: unknown): Record<string, unknown> {
  const registration = (body ?? {}) as Record<string, unknown>;
  const method = registration.token_endpoint_auth_method ?? "none";
  if (method !== "none") {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_client_metadata",
      error_description: "Only public clients may register",
    });
  }
  const redirectUris = Array.isArray(registration.redirect_uris) ? registration.redirect_uris : [];
  const isNative = registration.application_type === undefined && redirectUris.some(isLoopback);
  return {
    ...registration,
    token_endpoint_auth_method: "none",
    ...(isNative ? { application_type: "native" } : {}),
  };
}

function isLoopback(uri: unknown): boolean {
  if (typeof uri !== "string" || !URL.canParse(uri)) {
    return false;
  }
  const { protocol, hostname } = new URL(uri);
  return (
    protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname.toLowerCase())
  );
}

/**
 * The consent narrowed to reading: no tool changes anything yet, so a person is never asked to allow
 * that, and an agent asks again once one does.
 */
function readOnlyConsent(body: unknown): Record<string, unknown> {
  const consent = (body ?? {}) as ConsentBody & { scope?: unknown };
  const query = typeof consent.oauth_query === "string" ? consent.oauth_query : "";
  const requested =
    typeof consent.scope === "string"
      ? consent.scope
      : (new URLSearchParams(query).get("scope") ?? "");
  const scope = requested
    .split(" ")
    .filter((each) => each !== WRITE_SCOPE)
    .join(" ");
  return { ...consent, scope };
}

/** Whether consent ended in a code for the client, not a denial or an error. */
function grantedCode(returned: unknown): boolean {
  const url = (returned as { url?: unknown } | undefined)?.url;
  return typeof url === "string" && URL.canParse(url) && new URL(url).searchParams.has("code");
}
