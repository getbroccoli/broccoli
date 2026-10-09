import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished } from "vitest";

import type { RunningServer } from "../../src/server.js";
import { createTestDatabase, type TestDatabase } from "./support/test-databases.js";
import { startTestServer, waitForStartup } from "./support/test-server.js";

const run = inject("testRun");

const READY = { httpStatus: 200, status: "ready" };
const UNAVAILABLE = { httpStatus: 503, status: "unavailable" };
const UNREACHABLE_DATABASE_URL = "postgres://broccoli@127.0.0.1:1/broccoli_test_unreachable";

describe("on a migrated database", () => {
  let database: TestDatabase;
  let server: RunningServer;

  beforeAll(async () => {
    database = await createTestDatabase(run);
    server = await startTestServer(database.url);
  });

  afterAll(async () => {
    await server.stop();
    await database.drop();
  });

  it("reports the process as alive", async () => {
    const response = await fetch(`${server.url}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports ready once startup has finished", async () => {
    expect(await waitForStartup(server)).toEqual(READY);
  });
});

it("reports unavailable when the database cannot be reached", async () => {
  const server = await startTestServer(UNREACHABLE_DATABASE_URL);
  onTestFinished(() => server.stop());

  expect(await waitForStartup(server)).toEqual(UNAVAILABLE);
});
