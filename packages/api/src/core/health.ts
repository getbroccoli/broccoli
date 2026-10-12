import { setTimeout as delay } from "node:timers/promises";

import { Router } from "express";

import type { Readiness } from "./readiness";

type InitStatus = "waiting" | "ready";

/** As long as the database check may take; a slower read means the database is stuck. */
const INIT_STATUS_TIMEOUT_MS = 2_000;

/**
 * Liveness and readiness probes for orchestrators and load balancers.
 *
 * - `/healthz` answers 200 while the process runs. A failing liveness probe means
 *   "restart me".
 * - `/readyz` answers 200 `ready` only after migrations have succeeded and while the
 *   database responds; otherwise 503 with `starting` (migrations still running) or
 *   `unavailable` (migrations failed, or the database is down or stalled). A failing
 *   readiness probe means "send no traffic", without restarting the process. Managed
 *   instances add `initStatus`: `waiting` until their signed init, then `ready`. A
 *   waiting instance is still ready, so orchestration can reach `/api/init`.
 */
export function healthRouter(readiness: Readiness, initStatus?: () => Promise<InitStatus>): Router {
  const router = Router();

  router.get("/healthz", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.get("/readyz", async (_request, response) => {
    const status = await readiness.check();
    if (status !== "ready") {
      response.status(503).json({ status });
      return;
    }
    if (!initStatus) {
      response.json({ status });
      return;
    }
    const assignment = await readInitStatus(initStatus);
    if (!assignment) {
      response.status(503).json({ status: "unavailable" });
      return;
    }
    response.json({ status, initStatus: assignment });
  });

  return router;
}

/** Null when the init status cannot be read in time, like a database that does not answer. */
async function readInitStatus(initStatus: () => Promise<InitStatus>): Promise<InitStatus | null> {
  try {
    return await Promise.race([initStatus(), delay(INIT_STATUS_TIMEOUT_MS, null, { ref: false })]);
  } catch {
    return null;
  }
}
