import { createServer, type AddressInfo } from "node:net";

import { expect, inject, it, onTestFinished } from "vitest";

import {
  createEmptyTestDatabase,
  fetchReadiness,
  holdMigrationLock,
  startDisconnectingProxy,
  startTestServer,
  waitForStartup,
  type TestDatabase,
} from "./support";

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
  const proxy = await startDisconnectingProxy(database.url);
  const server = await startTestServer(proxy.url);
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
  const server = await startTestServer(database.url);

  await expect(server.stop()).resolves.toBeUndefined();
}, 5_000);

it("becomes ready when the database comes up after it started", async () => {
  const database = await emptyDatabase();
  const port = await findFreePort();
  const databaseUrl = new URL(database.url);
  databaseUrl.host = `127.0.0.1:${port}`;
  const server = await startTestServer(databaseUrl.href);
  onTestFinished(() => server.stop());
  expect(await waitForStartup(server)).toEqual(UNAVAILABLE);

  const proxy = await startDisconnectingProxy(database.url, port);
  onTestFinished(() => proxy.disconnect());

  await expect.poll(() => fetchReadiness(server), { timeout: 10_000 }).toEqual(READY);
});

async function findFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
