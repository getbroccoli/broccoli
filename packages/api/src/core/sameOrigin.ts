import type { IncomingHttpHeaders } from "node:http";

import type { RequestHandler } from "express";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether a page on another origin sent the request: its `Origin` names neither the
 * request's `Host` nor the public URL. A request without `Origin` came from no page.
 */
export function isCrossOrigin(
  { origin, host }: IncomingHttpHeaders,
  publicUrl: string | undefined,
): boolean {
  if (origin === undefined) {
    return false;
  }
  const originHost = URL.canParse(origin) ? new URL(origin).host : null;
  return originHost !== host && originHost !== (publicUrl && new URL(publicUrl).host);
}

/**
 * Refuses a state-changing request unless a page on this origin sent it, for endpoints
 * that act without a session cookie, such as the first claim of setup.
 */
export function requireSameOriginWrites(publicUrl?: string): RequestHandler {
  return (request, response, next) => {
    const fromOwnPage =
      request.headers.origin !== undefined && !isCrossOrigin(request.headers, publicUrl);
    if (READ_METHODS.has(request.method) || fromOwnPage) {
      next();
      return;
    }
    response.status(403).json({ error: "cross_origin" });
  };
}
