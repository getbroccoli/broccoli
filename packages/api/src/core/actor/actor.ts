import { fromNodeHeaders } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";

import { ApplicationError } from "../application-error";
import type { Orm } from "../db";
import { readOwnerUserId } from "../instance";
import type { Auth } from "../auth";

/** Who is calling the API. */
export interface Actor {
  userId: string;
  /** Login email, lowercased. */
  email: string;
  isOwner: boolean;
}

/**
 * The signed-in user of a request, or null without a valid session. A session due
 * for renewal is extended, and its renewed cookie is added to `response`.
 */
export async function resolveActor(
  auth: Auth,
  orm: Orm,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<Actor | null> {
  // Better Auth answers a request without a session cookie without a query.
  const { headers, response: session } = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) {
    response.appendHeader("Set-Cookie", cookie);
  }
  if (!session) {
    return null;
  }
  const { id: userId, email } = session.user;
  return { userId, email, isOwner: userId === (await readOwnerUserId(orm)) };
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
