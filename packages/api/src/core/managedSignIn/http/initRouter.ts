import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import type { Transact } from "../../db";
import { AssignmentConflictError, assignInstance } from "../../instance";
import type { Readiness } from "../../readiness";
import type { AuthSource } from "../../auth";
import { PrincipalSecurityContext } from "../../security";
import { InvalidAssignmentError, InvalidTokenError, parseInitClaims } from "../domain";
import { verifyToken, type TokenCheck } from "../jwt";

const MAX_TOKEN_LENGTH = 8192;
/** Orchestration sends one init and a few retries; the endpoint is reachable from the internet. */
const INIT_ATTEMPTS_PER_MINUTE = 30;

export interface InitRouterOptions {
  transact: Transact;
  /** Init tokens must be addressed to this instance and signed by the accounts service. */
  tokenCheck: TokenCheck;
  readiness: Readiness;
  auth: AuthSource;
}

/**
 * `POST /api/init`: orchestration assigns this managed instance to a company with a
 * signed request. Repeating the same assignment is harmless, so it keeps no `jti`.
 */
export function initRouter({ transact, tokenCheck, readiness, auth }: InitRouterOptions): Router {
  const router = Router();
  const limit = rateLimit({ windowMs: 60_000, limit: INIT_ATTEMPTS_PER_MINUTE });
  router.post("/api/init", limit, async (request, response) => {
    response.set("Cache-Control", "no-store");
    if ((await readiness.check()) !== "ready") {
      response.status(503).json({ error: "starting" });
      return;
    }
    const token = bearerToken(request.headers.authorization);
    if (!token) {
      response.status(401).json({ error: "invalid_token" });
      return;
    }
    try {
      const payload = await verifyToken(token, tokenCheck);
      const assignment = parseInitClaims(payload);
      await transact(async (tx) => {
        await assignInstance(PrincipalSecurityContext.system(), tx, assignment);
        // Strict, after the row lock: the token must still be valid when the assignment commits.
        if (payload.exp! * 1000 <= Date.now()) {
          throw new InvalidTokenError();
        }
      });
      await auth.current();
      response.json({ initStatus: "ready" });
    } catch (error) {
      const { status, code } = initFailure(error);
      response.status(status).json({ error: code });
    }
  });
  return router;
}

function bearerToken(header: string | undefined): string | null {
  const token = /^Bearer (\S+)$/.exec(header ?? "")?.[1];
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

function initFailure(error: unknown): { status: number; code: string } {
  if (error instanceof InvalidTokenError) {
    return { status: 401, code: "invalid_token" };
  }
  if (error instanceof InvalidAssignmentError) {
    return { status: 400, code: "invalid_assignment" };
  }
  if (error instanceof AssignmentConflictError) {
    return { status: 409, code: "assigned_elsewhere" };
  }
  return { status: 503, code: "unavailable" };
}
