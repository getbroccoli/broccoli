import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { requireSameOriginWrites } from "../../sameOrigin";

/** Setup requests per address and minute: enough for a person, little for guessing. */
const SETUP_ATTEMPTS_PER_MINUTE = 10;

/**
 * Guards the setup endpoints of the Better Auth plugin before they run: a limit per
 * socket address, and the same-origin check Better Auth skips for a request without
 * cookies, such as the first claim of setup.
 */
export function setupRouter(publicUrl?: string): Router {
  const router = Router();
  router.post(
    ["/api/auth/setup", "/api/auth/setup/start"],
    rateLimit({
      windowMs: 60_000,
      limit: SETUP_ATTEMPTS_PER_MINUTE,
      // Without a trusted proxy the socket address counts; a forwarded header is ignored.
      validate: { xForwardedForHeader: false },
    }),
    requireSameOriginWrites(publicUrl),
  );
  return router;
}
