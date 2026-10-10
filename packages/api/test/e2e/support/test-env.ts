import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test as baseTest, inject } from "vitest";

import type { RunningServer } from "../../../src/core/server";
import { createBrowser, type Browser } from "./browser";
import { createTestDatabase, type TestDatabase } from "./test-databases";
import { startTestServer, waitForStartup, type TestServerOptions } from "./test-server";

export type TestEnvOptions = Omit<TestServerOptions, "dataDir">;

export const TEST_OWNER = { email: "owner@example.com", password: "correct horse battery staple" };

export interface SignedInOwner {
  browser: Browser;
  user: { id: string; email: string };
}

/**
 * One Broccoli for one test: its own database, data folder and a ready server. The
 * entry point to the other test tools.
 */
export class TestEnv {
  private constructor(
    readonly db: TestDatabase,
    readonly dataDir: string,
    private server: RunningServer,
  ) {}

  /** Starts a new environment and waits until it is ready. */
  static async start(options: TestEnvOptions = {}): Promise<TestEnv> {
    const db = await createTestDatabase(inject("testRun"));
    const dataDir = await mkdtemp(join(tmpdir(), "broccoli-data-"));
    return new TestEnv(db, dataDir, await startReady(db, dataDir, options));
  }

  get url(): string {
    return this.server.url;
  }

  /** A new browser with its own cookies. */
  browser(): Browser {
    return createBrowser(this.url);
  }

  /** Sets up the owner and returns a browser signed in as them. */
  async signInAsOwner(owner = TEST_OWNER): Promise<SignedInOwner> {
    const browser = this.browser();
    const response = await browser.post("/api/auth/setup", owner);
    if (response.status !== 200) {
      throw new Error(`Owner setup failed with ${response.status}: ${await response.text()}`);
    }
    const { user } = (await response.json()) as Pick<SignedInOwner, "user">;
    return { browser, user };
  }

  /** Stops the server and starts a new one on the same database and data folder. */
  async restart(options: TestEnvOptions = {}): Promise<void> {
    await this.server.stop();
    this.server = await startReady(this.db, this.dataDir, options);
  }

  async stop(): Promise<void> {
    await this.server.stop();
    await this.db.drop();
    await rm(this.dataDir, { recursive: true, force: true });
  }
}

/** Vitest's `test` with a fresh `env` for every test. */
export const test = baseTest.extend<{ env: TestEnv }>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  env: async ({}, use) => {
    const env = await TestEnv.start();
    await use(env);
    await env.stop();
  },
});

async function startReady(
  db: TestDatabase,
  dataDir: string,
  options: TestEnvOptions,
): Promise<RunningServer> {
  const server = await startTestServer(db.url, { ...options, dataDir });
  const readiness = await waitForStartup(server);
  if (readiness.status !== "ready") {
    await server.stop();
    throw new Error(`Test environment did not become ready: ${JSON.stringify(readiness)}`);
  }
  return server;
}
