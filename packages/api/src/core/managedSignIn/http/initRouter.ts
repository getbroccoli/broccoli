import { Router } from "express";

import { runInTransaction, type Orm } from "../../db";
import type { EventBus } from "../../events";
import { AssignmentConflictError, assignInstance } from "../../instance";
import type { Readiness } from "../../readiness";
import type { AuthSource } from "../app";
import { InvalidAssignmentError, InvalidTokenError, parseInitClaims } from "../domain";
import { verifyToken, type TokenCheck } from "../jwt";

const MAX_TOKEN_LENGTH = 8192;

export interface InitRouterOptions {
  orm: Orm;
  eventBus: EventBus;
  /** Init tokens must be addressed to this instance and signed by the accounts service. */
  tokenCheck: TokenCheck;
  readiness: Readiness;
  auth: AuthSource;
}

/**
 * `POST /api/init`: orchestration assigns this managed instance to a company with a
 * signed request. Repeating the same assignment is harmless, so it keeps no `jti`.
 */
export function initRouter({
  orm,
  eventBus,
  tokenCheck,
  readiness,
  auth,
}: InitRouterOptions): Router {
  const router = Router();
  router.post("/api/init", async (request, response) => {
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
      const assignment = parseInitClaims(await verifyToken(token, tokenCheck));
      await runInTransaction(orm, eventBus, (tx) => assignInstance(tx, assignment));
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
