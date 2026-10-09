import { Router } from "express";

import type { Readiness } from "./readiness.js";

/** Liveness (`/healthz`) and readiness (`/readyz`) probes. */
export function healthRouter(readiness: Readiness): Router {
  const router = Router();

  router.get("/healthz", (_request, response) => {
    response.json({ status: "ok" });
  });

  router.get("/readyz", async (_request, response) => {
    const status = await readiness.check();
    response.status(status === "ready" ? 200 : 503).json({ status });
  });

  return router;
}
