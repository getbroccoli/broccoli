import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { expect, inject, it, onTestFinished } from "vitest";

import type { Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { startServer } from "../../src/core/server";

import {
  createEmptyTestDatabase,
  employeeDirectory,
  fetchReadiness,
  holdMigrationLock,
  startDisconnectingProxy,
  startTestBroccoliServer,
  waitForStartup,
  type TestDatabase,
} from "#test/support";

const run = inject("testRun");

const READY = { httpStatus: 200, status: "ready" };
const UNAVAILABLE = { httpStatus: 503, status: "unavailable" };

it("migrates one empty database from two instances starting together", async () => {
  const database = await emptyDatabase();
  const servers = await Promise.all([
    startTestBroccoliServer(database.url),
    startTestBroccoliServer(database.url),
  ]);
  onTestFinished(async () => {
    await Promise.all(servers.map((server) => server.stop()));
  });

  expect(await Promise.all(servers.map(waitForStartup))).toEqual([READY, READY]);
});

it("stays alive and unavailable when its connection drops during migration", async () => {
  const database = await emptyDatabase();
  const lock = await holdMigrationLock(database.url);
  onTestFinished(() => lock.release());
  const proxy = await startDisconnectingProxy(database.url);
  const server = await startTestBroccoliServer(proxy.url);
  onTestFinished(() => server.stop());
  await expect.poll(() => lock.hasWaitingSession()).toBe(true);

  await proxy.disconnect();

  expect(await waitForStartup(server)).toEqual(UNAVAILABLE);
  expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
});

it("stops while another instance holds the migration lock", async () => {
  const database = await emptyDatabase();
  const lock = await holdMigrationLock(database.url);
  onTestFinished(() => lock.release());
  const server = await startTestBroccoliServer(database.url);

  await expect(server.stop()).resolves.toBeUndefined();
}, 5_000);

it("becomes ready when the database comes up after it started", async () => {
  const database = await emptyDatabase();
  const port = await findFreePort();
  const databaseUrl = new URL(database.url);
  databaseUrl.host = `127.0.0.1:${port}`;
  const server = await startTestBroccoliServer(databaseUrl.href);
  onTestFinished(() => server.stop());
  expect(await waitForStartup(server)).toEqual(UNAVAILABLE);

  const proxy = await startDisconnectingProxy(database.url, port);
  onTestFinished(() => proxy.disconnect());

  await expect.poll(() => fetchReadiness(server), { timeout: 10_000 }).toEqual(READY);
});

it("rejects startup and closes the database pool when a module router throws", async () => {
  const database = await emptyDatabase();
  const dataDir = await mkdtemp(join(tmpdir(), "broccoli-data-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  const routerError = new Error("Module router failed");
  let orm!: Orm;

  const startup = startServer(
    {
      databaseUrl: database.url,
      port: 0,
      deployment: { mode: "self_hosted" },
      dataDir,
    },
    createLogger("silent"),
    (dependencies) => {
      orm = dependencies.orm;
      return {
        employeeDirectory: employeeDirectory(orm),
        manifests: [
          {
            name: "broken",
            typeDefs: "type Query { ping: String }",
            resolvers: {},
            router: () => {
              throw routerError;
            },
          },
        ],
        addApprovedPeople: () => Promise.resolve(),
        setupDemo: {
          prepareStart: () => Promise.reject(new Error("No demo")),
          deleteAllEmployees: () => Promise.resolve(),
        },
      };
    },
  );

  await expect(startup).rejects.toBe(routerError);
  await expect(orm.execute(sql`select 1`)).rejects.toMatchObject({
    cause: { message: "Cannot use a pool after calling end on the pool" },
  });
});

async function emptyDatabase(): Promise<TestDatabase> {
  const database = await createEmptyTestDatabase(run);
  onTestFinished(() => database.drop());
  return database;
}

async function findFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
