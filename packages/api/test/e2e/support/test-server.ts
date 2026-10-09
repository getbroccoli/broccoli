import { setTimeout as delay } from "node:timers/promises";

import { createLogger } from "../../../src/logger.js";
import { startServer, type RunningServer } from "../../../src/server.js";

export interface Readiness {
  httpStatus: number;
  status: string;
}

const STARTUP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 25;

/** Starts the real API on a free port. */
export function startTestServer(databaseUrl: string): Promise<RunningServer> {
  return startServer({ databaseUrl, port: 0 }, createLogger("silent"));
}

/** Polls `/readyz` until the server has finished starting and returns its answer. */
export async function waitForStartup(server: RunningServer): Promise<Readiness> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const readiness = await fetchReadiness(server, Math.max(0, deadline - Date.now()));
    if (readiness.status !== "starting") {
      return readiness;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Server did not finish starting within ${STARTUP_TIMEOUT_MS} ms`);
}

async function fetchReadiness(server: RunningServer, timeoutMs: number): Promise<Readiness> {
  const response = await fetch(`${server.url}/readyz`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json()) as { status: string };
  return { httpStatus: response.status, status: body.status };
}
