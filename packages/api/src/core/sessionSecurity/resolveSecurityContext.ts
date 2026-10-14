import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";

import type { AuthSource } from "../auth";
import type { Orm } from "../db";
import { readOwnerUserId } from "../instance";
import { PrincipalSecurityContext, type RequestSecurity } from "../security";

/**
 * The signed-in user of a request. Reading the session also extends one that is due
 * for renewal; the GraphQL adapter sends `renewedCookies` back, or the browser's
 * cookie would expire before the session does.
 */
export async function resolveSecurityContext(
  authSource: AuthSource,
  orm: Orm,
  requestHeaders: IncomingHttpHeaders,
): Promise<RequestSecurity> {
  const auth = await authSource.current();
  // A managed instance waiting for init has no auth, so nobody is signed in.
  if (!auth) {
    return { security: null, renewedCookies: [] };
  }
  // Better Auth answers a request without a session cookie without a query.
  const { headers, response: session } = await auth.api.getSession({
    headers: fromNodeHeaders(requestHeaders),
    returnHeaders: true,
  });
  const renewedCookies = headers.getSetCookie();
  if (!session) {
    return { security: null, renewedCookies };
  }
  const { id: userId, email } = session.user;
  const isOwner = userId === (await readOwnerUserId(orm));
  return { security: PrincipalSecurityContext.user({ userId, email, isOwner }), renewedCookies };
}
