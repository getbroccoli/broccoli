import pg from "pg";
import { onTestFinished } from "vitest";

import {
  expect,
  MANAGED_ASSIGNMENT,
  MANAGED_INSTANCE_CREDENTIAL,
  managedOptions,
  postInit,
  startManagedEnv,
  startTestBroccoliServer,
  waitForStartup,
  test,
} from "#test/support";

test("rate limits init after 30 requests from the same client", async () => {
  const { env } = await startManagedEnv();
  for (let attempt = 0; attempt < 30; attempt++) {
    expect((await postInit(env, "bad-token")).status).toBe(401);
  }

  const response = await postInit(env, "bad-token");

  expect(response.status).toBe(429);
});

test("reports ready and waiting before init", async () => {
  const { env } = await startManagedEnv();

  const readiness = await fetch(`${env.url}/readyz`);
  expect(readiness.status).toBe(200);
  expect(await readiness.json()).toEqual({ status: "ready", initStatus: "waiting" });
});

test("reports unavailable when reading init status is blocked", async () => {
  const { env } = await startManagedEnv();
  const client = new pg.Client({ connectionString: env.db.url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE instance IN ACCESS EXCLUSIVE MODE");

    const readiness = await fetch(`${env.url}/readyz`, { signal: AbortSignal.timeout(5_000) });

    expect(readiness.status).toBe(503);
    expect(await readiness.json()).toEqual({ status: "unavailable" });
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("refuses GraphQL before init with a retry hint", async () => {
  const { env } = await startManagedEnv();

  const graphql = await env.browser().graphql("{ ping }");
  expect(graphql.status).toBe(503);
  expect(graphql.headers.get("retry-after")).toBeTruthy();
});

test("serves the preparing page before init", async () => {
  const { env } = await startManagedEnv();

  const page = await fetch(`${env.url}/people`, { headers: { accept: "text/html" } });
  expect(page.status).toBe(503);
  expect(await page.text()).toContain("Your workspace is being prepared");
});

test("refuses managed sign-in before init", async () => {
  const { env } = await startManagedEnv();

  expect((await fetch(`${env.url}/api/auth/managed/start`, { redirect: "manual" })).status).toBe(
    503,
  );
});

test("opens the instance to users after init", async () => {
  const { env, accounts } = await startManagedEnv();

  const first = await postInit(env, await accounts.signInit());
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ initStatus: "ready" });

  expect(await (await fetch(`${env.url}/readyz`)).json()).toEqual({
    status: "ready",
    initStatus: "ready",
  });
  expect((await env.browser().graphql("{ ping }")).status).toBe(200);
});

test("refuses init without an instance credential and stays waiting", async () => {
  const { env, accounts } = await startManagedEnv();

  const response = await postInit(env, await accounts.signInit({ config: MANAGED_ASSIGNMENT }));

  expect(response.status).toBe(400);
  expect(await (await fetch(`${env.url}/readyz`)).json()).toEqual({
    status: "ready",
    initStatus: "waiting",
  });
});

test("refuses a different assignment", async () => {
  const { env, accounts } = await startManagedEnv();
  await postInit(env, await accounts.signInit());

  const response = await postInit(
    env,
    await accounts.signInit({
      config: {
        ...MANAGED_ASSIGNMENT,
        instanceCredential: MANAGED_INSTANCE_CREDENTIAL,
        companyId: "c-other",
      },
    }),
  );

  expect(response.status).toBe(409);
});

test.each([
  ["another issuer", { issuer: "https://other.example.com" }],
  ["another instance", { audience: "instance:slot-2" }],
  ["another purpose", { purpose: "entry" }],
  ["a lifetime over a minute", { lifetimeSeconds: 61 }],
])("refuses an init token for %s", async (_kind, options) => {
  const { env, accounts } = await startManagedEnv();

  expect((await postInit(env, await accounts.signInit(options))).status).toBe(401);
});

test("refuses a malformed assignment", async () => {
  const { env, accounts } = await startManagedEnv();

  const token = await accounts.signInit({
    config: {
      ...MANAGED_ASSIGNMENT,
      instanceCredential: MANAGED_INSTANCE_CREDENTIAL,
      publicOrigin: "https://acme.example.com/app",
    },
  });

  expect((await postInit(env, token)).status).toBe(400);
});

test("refuses an init token that expired within the clock tolerance", async () => {
  const { env, accounts } = await startManagedEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = await accounts.signInit({ issuedAt: now - 59, expiresAt: now - 1 });

  const response = await postInit(env, token);

  expect(response.status).toBe(401);
});

test("refuses a sign-in ticket posted as init", async () => {
  const { env, accounts } = await startManagedEnv();
  const token = await accounts.signTicket({ sub: "subject-1" });

  const response = await postInit(env, token);

  expect(response.status).toBe(401);
});

test("answers unavailable when the issuer's keys cannot be read", async () => {
  const { env, accounts } = await startManagedEnv();
  const token = await accounts.signInit();
  await accounts.stop();

  expect((await postInit(env, token)).status).toBe(503);
});

test("serves sign-in on a waiting replica after another server assigns it", async () => {
  const { env, accounts } = await startManagedEnv();
  const replica = await startTestBroccoliServer(env.db.url, {
    dataDir: env.dataDir,
    ...managedOptions(accounts),
  });
  onTestFinished(() => replica.stop());
  await waitForStartup(replica);
  const before = await fetch(`${replica.url}/api/auth/managed/start`, { redirect: "manual" });
  expect(before.status).toBe(503);

  expect((await postInit(env, await accounts.signInit())).status).toBe(200);

  const response = await fetch(`${replica.url}/api/auth/managed/start`, { redirect: "manual" });
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location")!).origin).toBe(MANAGED_ASSIGNMENT.websiteOrigin);
});

test("has no init endpoint when self-hosted", async ({ env }) => {
  expect((await fetch(`${env.url}/api/init`, { method: "POST" })).status).toBe(404);
});
