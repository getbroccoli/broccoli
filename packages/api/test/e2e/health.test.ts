import { onTestFinished } from "vitest";

import { expect, startTestServer, test, waitForStartup } from "./support";

const UNREACHABLE_DATABASE_URL = "postgres://broccoli@127.0.0.1:1/broccoli_test_unreachable";

test("reports the process as alive", async ({ env }) => {
  const response = await fetch(`${env.url}/healthz`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("reports ready once startup has finished", async ({ env }) => {
  const response = await fetch(`${env.url}/readyz`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ready" });
});

test("reports unavailable when the database cannot be reached", async () => {
  const server = await startTestServer(UNREACHABLE_DATABASE_URL);
  onTestFinished(() => server.stop());

  expect(await waitForStartup(server)).toEqual({ httpStatus: 503, status: "unavailable" });
});
