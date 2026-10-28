import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import type { Mode } from "../../../core/env";

const INVITE_PATHS = new Set(["/api/auth/invite/lookup", "/api/auth/invite/accept"]);

/**
 * Limits the invite page's endpoints before Better Auth runs them; lookup and accept share one
 * count. Self-hosted counts per socket address. A managed ingress passes on a client's
 * `X-Forwarded-For` and is itself the socket, so there the instance shares one higher count.
 * Tokens carry 256 bits, so this stops load and password spraying, not guessing.
 */
export function inviteRateLimit(mode: Mode): Router {
  const limit = rateLimit({
    windowMs: 60_000,
    limit: mode === "managed" ? 300 : 20,
    validate: { xForwardedForHeader: false },
    ...(mode === "managed" && { keyGenerator: () => "instance" }),
  });
  return Router().post("/auth/{*path}", (request, response, next) => {
    // Better Auth resolves dot segments, so `/api/auth/./invite/accept` must not skip the limit.
    const path = new URL(request.originalUrl, "http://localhost").pathname;
    if (INVITE_PATHS.has(path)) {
      void limit(request, response, next);
    } else {
      next();
    }
  });
}
