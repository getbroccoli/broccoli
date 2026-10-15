import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import type { Deployment } from "../../src/core/env";
import { createLogger } from "../../src/core/logger";
import { startServer, type RunningServer } from "../../src/core/server";
import { createModules } from "../../src/modules";

export interface Readiness {
  httpStatus: number;
  status: string;
}

const STARTUP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 25;

export interface TestBroccoliServerOptions {
  webDir?: string;
  /** Defaults to a new temporary folder, removed when the server stops. */
  dataDir?: string;
  /** Starts a managed instance; unset is self-hosted. */
  managed?: { instanceId: string; accountsUrl: string };
  publicUrl?: string;
  brandLookupUrl?: string | null;
  decisionsUrl?: string;
  slack?: { relayUrl: string; apiUrl: string };
}

/**
 * Starts Broccoli itself, the real API with every module, on a free port and a test
 * database. End-to-end tests reach it through `TestEnv`.
 */
export async function startTestBroccoliServer(
  databaseUrl: string,
  {
    webDir,
    dataDir,
    managed,
    publicUrl,
    brandLookupUrl = null,
    decisionsUrl = "http://127.0.0.1:9",
    slack = { relayUrl: "http://127.0.0.1:9", apiUrl: "http://127.0.0.1:9" },
  }: TestBroccoliServerOptions = {},
): Promise<RunningServer> {
  const ownsDataDir = dataDir === undefined;
  const folder = dataDir ?? (await mkdtemp(join(tmpdir(), "broccoli-data-")));
  const deployment: Deployment = managed
    ? {
        mode: "managed",
        instanceId: managed.instanceId,
        accountsOrigin: managed.accountsUrl,
      }
    : { mode: "self_hosted", publicUrl };
  const server = await startServer(
    {
      databaseUrl,
      port: 0,
      webDir,
      deployment,
      dataDir: folder,
    },
    createLogger("silent"),
    (core) =>
      createModules(core, {
        mode: deployment.mode,
        brandLookupUrl,
        publicUrl,
        slack,
        model: managed ? { url: decisionsUrl, apiKey: "test-model-key" } : null,
      }),
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
