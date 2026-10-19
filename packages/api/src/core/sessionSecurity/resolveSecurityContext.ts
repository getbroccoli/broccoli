import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";

import type { AuthSource } from "../auth";
import type { Orm } from "../db";
import { readDemoExpiresAt, readOwnerUserId, readSetupHolder, readSetupToken } from "../instance";
import { isCrossOrigin } from "../sameOrigin";
import { PrincipalSecurityContext, type RequestSecurity, type SecurityContext } from "../security";

/**
 * The signed-in user of a request, or the browser holding setup; the demo's provisional
 * owner only until the demo ends. Reading the session also extends one that is due
 * for renewal; the GraphQL adapter sends `renewedCookies` back, or the browser's
 * cookie would expire before the session does.
 */
export async function resolveSecurityContext(
  authSource: AuthSource,
  orm: Orm,
  requestHeaders: IncomingHttpHeaders,
): Promise<RequestSecurity> {
  const auth = await authSource.current();
  // A managed instance waiting for init has no auth, so nobody is signed in. A page on
  // another origin gets no authority from the browser's cookies.
  if (!auth || isCrossOrigin(requestHeaders, auth.options.baseURL)) {
    return { security: null, renewedCookies: [] };
  }
  // Better Auth answers a request without a session cookie without a query.
  const { headers, response: session } = await auth.api.getSession({
    headers: fromNodeHeaders(requestHeaders),
    returnHeaders: true,
  });
  const renewedCookies = headers.getSetCookie();
  if (!session) {
    return { security: await resolveSetupHolder(orm, requestHeaders), renewedCookies };
  }
  const { id: userId, email } = session.user;
  const isOwner = userId === (await readOwnerUserId(orm));
  if (isOwner && (await hasDemoEnded(orm))) {
    return { security: null, renewedCookies: [] };
  }
  return { security: PrincipalSecurityContext.user({ userId, email, isOwner }), renewedCookies };
}

/** Whether the owner is still the demo's provisional one after its deadline; renewal cannot extend it. */
async function hasDemoEnded(orm: Orm): Promise<boolean> {
  const expiresAt = await readDemoExpiresAt(orm);
  return expiresAt !== null && expiresAt <= new Date();
}

/** The setup holder, for a request carrying the live setup token; otherwise null. */
async function resolveSetupHolder(
  orm: Orm,
  requestHeaders: IncomingHttpHeaders,
): Promise<SecurityContext | null> {
  const token = readSetupToken(requestHeaders.cookie);
  if (!token || (await readSetupHolder(orm, { token, now: new Date() })) !== "you") {
    return null;
  }
  return PrincipalSecurityContext.setupHolder();
}
