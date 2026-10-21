import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { inject } from "vitest";

import { session, user } from "../../src/core/auth/db";
import { connectDatabase, type Database } from "../../src/core/db";
import { readInstance } from "../../src/core/instance";
import { createLogger } from "../../src/core/logger";
import type { RunningServer } from "../../src/core/server";
import { createTestDatabase, type TestDatabase } from "./testDatabases";
import { TestSeed } from "./testSeed";
import { createBrowser, type Browser } from "./browser";
import {
  startTestBroccoliServer,
  waitForStartup,
  type TestBroccoliServerOptions,
} from "./testBroccoliServer";

export type TestEnvOptions = Omit<TestBroccoliServerOptions, "dataDir">;

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
    await this.seed.owner(owner);
    const browser = this.browser();
    const response = await browser.post("/api/auth/sign-in/email", owner);
    if (response.status !== 200) {
      throw new Error(`Owner sign-in failed with ${response.status}: ${await response.text()}`);
    }
    const { user } = (await response.json()) as Pick<SignedInOwner, "user">;
    return { browser, user };
  }

  async startSetupAtImport(): Promise<Browser> {
    const browser = this.browser();
    const started = await browser.post("/api/auth/setup/start", undefined);
    if (started.status !== 200) {
      throw new Error(`Setup start failed with ${started.status}: ${await started.text()}`);
    }
    const named = await browser.graphql(`
      mutation { company { update(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } } }
    `);
    assert.deepEqual(await named.json(), {
      data: { company: { update: { company: { id: "company" }, error: null } } },
    });
    return browser;
  }

  async startDemo(): Promise<SignedInOwner & { response: Response }> {
    const browser = await this.startSetupAtImport();
    const response = await browser.post("/api/auth/setup/demo", undefined);
    if (response.status !== 200) {
      throw new Error(`Demo start failed with ${response.status}: ${await response.text()}`);
    }
    const { user } = (await response.json()) as Pick<SignedInOwner, "user">;
    return { browser, user, response };
  }

  async expireDemo(): Promise<void> {
    await this.setDemoDeadline(new Date("2000-01-01T00:00:00Z"));
  }

  async setDemoDeadline(expiresAt: Date): Promise<void> {
    await this.seed.demoDeadline(expiresAt);
  }

  async readDemoSession(userId: string): Promise<{ expiresAt: Date; demoExpiresAt: Date | null }> {
    const [savedSession] = await this.database.orm
      .select({ expiresAt: session.expiresAt })
      .from(session)
      .where(eq(session.userId, userId));
    assert(savedSession);
    const { demoExpiresAt } = await readInstance(this.database.orm);
    return { ...savedSession, demoExpiresAt };
  }

  async expireSessionAt(userId: string, expiresAt: Date): Promise<void> {
    await this.database.orm.update(session).set({ expiresAt }).where(eq(session.userId, userId));
  }

  async createUser(email: string): Promise<void> {
    await this.database.orm.insert(user).values({ id: randomUUID(), name: "User", email });
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
  const server = await startTestBroccoliServer(db.url, { ...options, dataDir });
  const readiness = await waitForStartup(server);
  if (readiness.status !== "ready") {
    await server.stop();
    throw new Error(`Test environment did not become ready: ${JSON.stringify(readiness)}`);
  }
  return server;
}
