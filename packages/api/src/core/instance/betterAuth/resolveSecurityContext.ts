import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";

import type { AuthSource } from "../../auth";
import type { Orm } from "../../db";
import { isCrossOrigin } from "../helpers";
import {
  type EmployeeDirectory,
  permissionProfileRepository,
  PrincipalSecurityContext,
  profilesOf,
  type RequestSecurity,
  type SecurityContext,
} from "../../security";
import { readInstance, readSetupHolder } from "../app";
import type { Instance } from "../domain";
import { readSetupToken } from "./setupCookie";

/**
 * The signed-in user of a request, or the browser holding setup; the demo's provisional
 * owner only until the demo ends. Reading the session also extends one that is due
 * for renewal; the GraphQL adapter sends `renewedCookies` back, or the browser's
 * cookie would expire before the session does.
 */
export async function resolveSecurityContext(
  authSource: AuthSource,
  orm: Orm,
  directory: EmployeeDirectory,
  requestHeaders: IncomingHttpHeaders,
): Promise<RequestSecurity> {
  const auth = await authSource.current();
  // A managed instance waiting for init has no auth, so nobody is signed in. A page on
  // another origin gets no authority from the browser's cookies, nor does a request carrying
  // the external agent's bearer token, which only the agent routes read.
  if (
    !auth ||
    isCrossOrigin(requestHeaders, auth.options.baseURL) ||
    requestHeaders.authorization !== undefined
  ) {
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
  const instance = await readInstance(orm);
  const isOwner = userId === instance.ownerUserId;
  if (hasDemoEnded(instance, userId)) {
    return { security: null, renewedCookies: [] };
  }
  const user = {
    userId,
    email,
    isOwner,
    permissionProfiles: profilesOf(
      (await permissionProfileRepository(orm).findExtras([userId])).get(userId) ?? [],
      isOwner,
    ),
    employeeId: await directory.employeeIdOfUser(userId),
  };
  return { security: PrincipalSecurityContext.user(user, directory), renewedCookies };
}

/** Whether the user is the demo's provisional owner after its deadline, which nothing extends. */
function hasDemoEnded(instance: Instance, userId: string): boolean {
  const deadline = instance.demoDeadlineOf(userId);
  return deadline !== null && deadline <= new Date();
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
