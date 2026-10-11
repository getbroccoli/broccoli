import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { inject } from "vitest";

import { session, user } from "../../src/core/auth";
import { connectDatabase, type Database } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import type { RunningServer } from "../../src/core/server";
import { createTestDatabase, type TestDatabase } from "./test-databases";
import { TestSeed } from "./test-seed";
import { createBrowser, type Browser } from "./browser";
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
  /** Creates test data through the use cases, on this environment's database. */
  readonly seed: TestSeed;
  private readonly database: Database;

  private constructor(
    readonly db: TestDatabase,
    readonly dataDir: string,
    private server: RunningServer,
  ) {
    this.database = connectDatabase(db.url, createLogger("silent"));
    this.seed = new TestSeed(this.database.orm);
  }

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

  async changeUserEmail(userId: string, email: string): Promise<void> {
    await this.database.orm.update(user).set({ email }).where(eq(user.id, userId));
  }

  async expireSessionsIn(days: number): Promise<void> {
    await this.database.orm
      .update(session)
      .set({ expiresAt: sql`now() + ${days} * interval '1 day'` });
  }

  /** Stops the server and starts a new one on the same database and data folder. */
  async restart(options: TestEnvOptions = {}): Promise<void> {
    await this.server.stop();
    this.server = await startReady(this.db, this.dataDir, options);
  }

  async stop(): Promise<void> {
    await this.database.close();
    await this.server.stop();
    await this.db.drop();
    await rm(this.dataDir, { recursive: true, force: true });
  }
}

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
