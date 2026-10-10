import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunningServer } from "../../../src/core/server";
import { createTestDatabase, type TestDatabase, type TestRun } from "./test-databases";
import { startTestServer, waitForStartup, type TestServerOptions } from "./test-server";

type InstanceOptions = Omit<TestServerOptions, "dataDir">;

/** A new Broccoli instance with its own database, data folder and running server. */
export class TestInstance {
  private constructor(
    private readonly database: TestDatabase,
    readonly dataDir: string,
    private server: RunningServer,
  ) {}

  /** Starts an instance and waits until it is ready. */
  static async start(run: TestRun, options: InstanceOptions = {}): Promise<TestInstance> {
    const database = await createTestDatabase(run);
    const dataDir = await mkdtemp(join(tmpdir(), "broccoli-data-"));
    return new TestInstance(database, dataDir, await startReady(database, dataDir, options));
  }

  get url(): string {
    return this.server.url;
  }

  get setupTokenPath(): string {
    return join(this.dataDir, "secrets", "setup-token");
  }

  readSetupToken(): Promise<string> {
    return readFile(this.setupTokenPath, "utf8");
  }

  /** Stops the server and starts a new one on the same database and data folder. */
  async restart(options: InstanceOptions = {}): Promise<void> {
    await this.server.stop();
    this.server = await startReady(this.database, this.dataDir, options);
  }

  async stop(): Promise<void> {
    await this.server.stop();
    await this.database.drop();
    await rm(this.dataDir, { recursive: true, force: true });
  }
}

async function startReady(
  database: TestDatabase,
  dataDir: string,
  options: InstanceOptions,
): Promise<RunningServer> {
  const server = await startTestServer(database.url, { ...options, dataDir });
  const readiness = await waitForStartup(server);
  if (readiness.status !== "ready") {
    await server.stop();
    throw new Error(`Instance did not become ready: ${JSON.stringify(readiness)}`);
  }
  return server;
}
