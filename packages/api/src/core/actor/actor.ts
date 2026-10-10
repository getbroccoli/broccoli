import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";

import { ApplicationError } from "../application-error";
import type { Orm } from "../db";
import { readOwnerUserId } from "../instance";
import type { Auth } from "../auth";

/** Who is calling the API. */
export interface Actor {
  userId: string;
  isOwner: boolean;
}

/** The signed-in user of a request, or null without a valid session. */
export async function resolveActor(
  auth: Auth,
  orm: Orm,
  headers: IncomingHttpHeaders,
): Promise<Actor | null> {
  // Better Auth answers a request without a session cookie without a query.
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  if (!session) {
    return null;
  }
  const userId = session.user.id;
  return { userId, isOwner: userId === (await readOwnerUserId(orm)) };
}

/** Owner-only access: until permission scopes exist, the owner may do everything. */
export function requireOwner(actor: Actor | null): Actor {
  if (!actor) {
    throw new ApplicationError("UNAUTHENTICATED", "Sign in to continue.");
  }
  if (!actor.isOwner) {
    throw new ApplicationError("FORBIDDEN", "Only the owner can do this.");
  }
  return actor;
}
