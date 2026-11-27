import type { IncomingHttpHeaders } from "node:http";

import { ApplicationError } from "../applicationError";
import type { SecurityContext } from "./securityContext";

/** The security context of a request, and the session cookies to send back with the response. */
export interface RequestSecurity {
  /** Null without a valid session. */
  security: SecurityContext | null;
  /** `Set-Cookie` values for a session that was due for renewal; empty otherwise. */
  renewedCookies: string[];
}

/** Reads the security context of a request from its headers; see `resolveSecurityContext`. */
export type SecurityResolver = (headers: IncomingHttpHeaders) => Promise<RequestSecurity>;

/**
 * The security context of a request that needs a signed-in user. Adapters (GraphQL,
 * HTTP, MCP) call it, so application code always receives a context.
 */
export function requireSignedIn(security: SecurityContext | null): SecurityContext {
  if (!security) {
    throw new ApplicationError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return security;
}
