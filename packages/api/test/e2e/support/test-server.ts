import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { Mode } from "../../../src/core/env";
import { createLogger } from "../../../src/core/logger";
import { startServer, type RunningServer } from "../../../src/core/server";
import { modules } from "../../../src/modules";

export interface Readiness {
  httpStatus: number;
  status: string;
}

const STARTUP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 25;

export interface TestServerOptions {
  webDir?: string;
  /** Defaults to a new temporary folder, removed when the server stops. */
  dataDir?: string;
  mode?: Mode;
  publicUrl?: string;
}

/** Starts the real API on a free port. */
export async function startTestServer(
  databaseUrl: string,
  { webDir, dataDir, mode = "self_hosted", publicUrl }: TestServerOptions = {},
): Promise<RunningServer> {
  const ownsDataDir = dataDir === undefined;
  const folder = dataDir ?? (await mkdtemp(join(tmpdir(), "broccoli-data-")));
  const server = await startServer(
    { databaseUrl, port: 0, webDir, mode, dataDir: folder, publicUrl },
    createLogger("silent"),
    modules,
  );
  return {
    url: server.url,
    stop: async () => {
      await server.stop();
      if (ownsDataDir) {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
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

/** One `/readyz` answer. */
export async function fetchReadiness(
  server: RunningServer,
  timeoutMs = STARTUP_TIMEOUT_MS,
): Promise<Readiness> {
  const response = await fetch(`${server.url}/readyz`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json()) as { status: string };
  return { httpStatus: response.status, status: body.status };
}
