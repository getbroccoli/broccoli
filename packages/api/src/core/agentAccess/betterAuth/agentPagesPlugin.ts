import { createAuthEndpoint } from "@better-auth/core/api";
import type { BetterAuthPlugin } from "better-auth";

import { ALLOW_AGENT_PAGE } from "../domain";

/** Where the OAuth provider sends a signed-out person, under `/api/auth`. */
export const AGENT_SIGN_IN_PATH = "/agent/sign-in";
/** Where the OAuth provider asks the person to allow their agent, under `/api/auth`. */
export const AGENT_ALLOW_PATH = "/agent/allow";

/**
 * The signature over the agent's request, which the authorize endpoint does not take back, and the
 * prompt that asked for this sign-in, which would ask again.
 */
const SIGNATURE_PARAMETERS = ["exp", "ba_iat", "ba_param", "ba_pl", "sig", "prompt"];

/**
 * Hands the agent's request to the web app's pages as one opaque value each, never as separate
 * search parameters, which the app's router would read as JSON and rewrite: a `state` such as
 * `1e3` would come back to the agent changed, and a signed request would fail its signature.
 */
export function agentPagesPlugin(): BetterAuthPlugin {
  return {
    id: "agent-pages",
    endpoints: {
      agentSignIn: createAuthEndpoint(AGENT_SIGN_IN_PATH, { method: "GET" }, (ctx) => {
        const request = requestQueryOf(ctx.request);
        for (const name of SIGNATURE_PARAMETERS) {
          request.delete(name);
        }
        // Signing in returns to the authorize endpoint, which then asks to allow the agent.
        const authorize = `/api/auth/oauth2/authorize?${request.toString()}`;
        throw ctx.redirect(`/login?${new URLSearchParams({ redirect: authorize }).toString()}`);
      }),
      agentAllow: createAuthEndpoint(AGENT_ALLOW_PATH, { method: "GET" }, (ctx) => {
        const request = requestQueryOf(ctx.request).toString();
        throw ctx.redirect(`${ALLOW_AGENT_PAGE}?${new URLSearchParams({ request }).toString()}`);
      }),
    },
  } satisfies BetterAuthPlugin;
}

function requestQueryOf(request: Request | undefined): URLSearchParams {
  return new URLSearchParams(request ? new URL(request.url).search : "");
}
