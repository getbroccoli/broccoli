import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders, ServerResponse } from "node:http";

import { ApplicationError } from "../application-error";
import type { Orm } from "../db";
import { readOwnerUserId } from "../instance";
import type { Auth } from "../auth";

/** Who is calling the API. */
export interface Actor {
  userId: string;
  /** Sign-in email, lowercased; for display, never for authorization. */
  email: string;
  isOwner: boolean;
}

/** The caller of a request, and the session cookies to send back with the response. */
export interface RequestActor {
  /** Null without a valid session. */
  actor: Actor | null;
  /** `Set-Cookie` values for a session that was due for renewal; empty otherwise. */
  renewedCookies: string[];
}

/**
 * The signed-in user of a request. Reading the session also extends one that is due
 * for renewal; the caller must send `renewedCookies` back, or the browser's cookie
 * expires before the session does.
 */
export async function resolveActor(
  auth: Auth,
  orm: Orm,
  requestHeaders: IncomingHttpHeaders,
): Promise<RequestActor> {
  // Better Auth answers a request without a session cookie without a query.
  const { headers, response: session } = await auth.api.getSession({
    headers: fromNodeHeaders(requestHeaders),
    returnHeaders: true,
  });
  const renewedCookies = headers.getSetCookie();
  if (!session) {
    return { actor: null, renewedCookies };
  }
  const { id: userId, email } = session.user;
  const isOwner = userId === (await readOwnerUserId(orm));
  return { actor: { userId, email, isOwner }, renewedCookies };
}

/** Adds the `renewedCookies` of `resolveActor` to the response. */
export function sendRenewedCookies(response: ServerResponse, renewedCookies: string[]): void {
  if (renewedCookies.length > 0) {
    response.appendHeader("Set-Cookie", renewedCookies);
  }
}

/**
 * The actor of a request that needs a signed-in user. Adapters (GraphQL, HTTP, MCP)
 * call it, so use cases always receive an actor.
 */
export function requireSignedIn(actor: Actor | null): Actor {
  if (!actor) {
    throw new ApplicationError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return actor;
}

/** Owner-only access: until permission scopes exist, the owner may do everything. */
export function requireOwner(actor: Actor): Actor {
  if (!actor.isOwner) {
    throw new ApplicationError("FORBIDDEN", "Only the owner can do this.");
  }
  return actor;
}
