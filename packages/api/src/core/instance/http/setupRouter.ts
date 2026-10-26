import { type RequestHandler, Router } from "express";
import { rateLimit } from "express-rate-limit";

import { requireSameOriginWrites } from "../helpers";

/** Setup requests per address and minute: enough for a person, little for guessing. */
const SETUP_ATTEMPTS_PER_MINUTE = 10;
/** Password reset requests per address and minute: enough for a person, little for mail bombing. */
const RESET_REQUESTS_PER_MINUTE = 5;
const RESET_REQUEST_PATH = "/api/auth/request-password-reset";

const SETUP_PATHS = new Set([
  "/api/auth/setup",
  "/api/auth/setup/start",
  "/api/auth/setup/demo",
  "/api/auth/setup/demo/reset",
]);

/**
 * Guards the setup endpoints of the Better Auth plugin before they run: a limit per
 * socket address, and the same-origin check Better Auth skips for a request without
 * cookies, such as the first claim of setup. Password reset requests get their own limit.
 */
export function setupRouter(publicUrl?: string): Router {
  const limit = limitPerMinute(SETUP_ATTEMPTS_PER_MINUTE);
  const limitResetRequests = limitPerMinute(RESET_REQUESTS_PER_MINUTE);
  const sameOrigin = requireSameOriginWrites(publicUrl);
  const guard: RequestHandler = (request, response, next) => {
    void limit(request, response, () => {
      sameOrigin(request, response, next);
    });
  };
  return Router().post("/api/auth/{*path}", (request, response, next) => {
    // Better Auth resolves dot segments, so `/api/auth/./setup` must not skip the guard.
    const path = new URL(request.originalUrl, "http://localhost").pathname;
    if (SETUP_PATHS.has(path)) {
      guard(request, response, next);
    } else if (path === RESET_REQUEST_PATH) {
      void limitResetRequests(request, response, next);
    } else {
      next();
    }
  });
}

function limitPerMinute(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    // Without a trusted proxy the socket address counts; a forwarded header is ignored.
    validate: { xForwardedForHeader: false },
  });
}
