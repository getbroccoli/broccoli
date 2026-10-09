import { expect, inject, it, onTestFinished } from "vitest";

import { holdMigrationLock } from "./support/migration-lock.js";
import { startStallingProxy } from "./support/stalling-proxy.js";
import { createEmptyTestDatabase, type TestDatabase } from "./support/test-databases.js";
import { startTestServer, waitForStartup } from "./support/test-server.js";

const run = inject("testRun");

const READY = { httpStatus: 200, status: "ready" };
const UNAVAILABLE = { httpStatus: 503, status: "unavailable" };

async function emptyDatabase(): Promise<TestDatabase> {
  const database = await createEmptyTestDatabase(run);
  onTestFinished(() => database.drop());
  return database;
}

it("migrates one empty database from two instances starting together", async () => {
  const database = await emptyDatabase();
  const servers = await Promise.all([startTestServer(database.url), startTestServer(database.url)]);
  onTestFinished(async () => {
    await Promise.all(servers.map((server) => server.stop()));
  });

  expect(await Promise.all(servers.map(waitForStartup))).toEqual([READY, READY]);
});

it("stays alive and unavailable when its connection drops during migration", async () => {
  const database = await emptyDatabase();
  const lock = await holdMigrationLock(database.url);
  onTestFinished(() => lock.release());
  const proxy = await startStallingProxy(database.url);
  const server = await startTestServer(proxy.url);
  onTestFinished(() => server.stop());
  await expect.poll(() => lock.hasWaitingSession()).toBe(true);

  await proxy.close();

  expect(await waitForStartup(server)).toEqual(UNAVAILABLE);
  expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
});

it("stops while another instance holds the migration lock", async () => {
  const database = await emptyDatabase();
  const lock = await holdMigrationLock(database.url);
  onTestFinished(() => lock.release());
  const server = await startTestServer(database.url);

  await expect(server.stop()).resolves.toBeUndefined();
}, 5_000);
