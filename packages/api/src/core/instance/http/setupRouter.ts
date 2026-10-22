import { type RequestHandler, Router } from "express";
import { rateLimit } from "express-rate-limit";

import { requireSameOriginWrites } from "../helpers";

/** Setup requests per address and minute: enough for a person, little for guessing. */
const SETUP_ATTEMPTS_PER_MINUTE = 10;

const SETUP_PATHS = new Set([
  "/api/auth/setup",
  "/api/auth/setup/start",
  "/api/auth/setup/demo",
  "/api/auth/setup/demo/reset",
]);

/**
 * Guards the setup endpoints of the Better Auth plugin before they run: a limit per
 * socket address, and the same-origin check Better Auth skips for a request without
 * cookies, such as the first claim of setup.
 */
export function setupRouter(publicUrl?: string): Router {
  const limit = rateLimit({
    windowMs: 60_000,
    limit: SETUP_ATTEMPTS_PER_MINUTE,
    // Without a trusted proxy the socket address counts; a forwarded header is ignored.
    validate: { xForwardedForHeader: false },
  });
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
    } else {
      next();
    }
  });
}
