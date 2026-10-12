import { Router } from "express";

import type { Readiness } from "./readiness";

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
export function healthRouter(
  readiness: Readiness,
  initStatus?: () => Promise<"waiting" | "ready">,
): Router {
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
    response.json(initStatus ? { status, initStatus: await initStatus() } : { status });
  });

  return router;
}
