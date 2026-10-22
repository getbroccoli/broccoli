import { expect, test } from "#test/support";

test("starting the demo signs in its owner for seven days and completes setup", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const before = Date.now();

  const response = await browser.post("/api/auth/setup/demo", undefined);

  const after = Date.now();
  expect(response.status).toBe(200);
  const { user } = (await response.json()) as { user: { id: string } };
  expect(user.id).toEqual(expect.any(String));
  expect(sessionCookieOf(response)).toBeDefined();
  expect(
    response.headers.getSetCookie().find((cookie) => cookie.startsWith("broccoli_setup=")),
  ).toMatch(/;\s*Max-Age=0(?:;|$)/i);
  const signedIn = await browser.graphql(
    "query { me { id isOwner } setup { id step holder demoExpiresAt } demo { id isPresent } }",
  );
  const body = (await signedIn.json()) as { data: { setup: { demoExpiresAt: string } } };
  expect(body).not.toHaveProperty("errors");
  expect(body).toMatchObject({
    data: {
      me: { id: user.id, isOwner: true },
      setup: { id: "instance", step: "DONE", holder: "NOBODY" },
      demo: { id: "demoData", isPresent: true },
    },
  });
  expect(body.data.setup.demoExpiresAt).toEqual(expect.any(String));
  const deadline = Date.parse(body.data.setup.demoExpiresAt);
  expect(deadline).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
  expect(deadline).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000);
});

test("starting the demo without the setup cookie is refused", async ({ env }) => {
  await env.startSetupAtImport();

  const response = await env.browser().post("/api/auth/setup/demo", undefined);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SETUP_IN_PROGRESS" });
});

test("starting the demo before naming the company reports the import-step error", async ({
  env,
}) => {
  const browser = env.browser();
  await browser.post("/api/auth/setup/start", undefined);

  const response = await browser.post("/api/auth/setup/demo", undefined);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "NOT_AT_IMPORT_STEP" });
});

test("the demo owner's session ends at the demo deadline", async ({ env }) => {
  const { user } = await env.startDemo();

  const { expiresAt, demoExpiresAt } = await env.readDemoSession(user.id);

  expect(expiresAt).toEqual(demoExpiresAt);
});

test("renewing the demo owner's session never passes the demo deadline", async ({ env }) => {
  const { browser, user } = await env.startDemo();
  const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await env.setDemoDeadline(deadline);
  await env.expireSessionsIn(5);

  const response = await browser.get("/api/auth/get-session");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { id: user.id } });
  expect(await env.readDemoSession(user.id)).toEqual({
    expiresAt: deadline,
    demoExpiresAt: deadline,
  });
});

test("Better Auth refuses the demo owner's session after the deadline", async ({ env }) => {
  const { browser, user, response: started } = await env.startDemo();
  const cookie = sessionCookieOf(started)!;
  await env.expireDemo();
  const { demoExpiresAt } = await env.readDemoSession(user.id);
  await env.expireSessionAt(user.id, demoExpiresAt!);

  const session = await browser.get("/api/auth/get-session");
  const update = await fetch(`${env.url}/api/auth/update-user`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: env.url, cookie },
    body: JSON.stringify({ name: "Mallory" }),
  });

  expect(session.status).toBe(200);
  expect(await session.json()).toBeNull();
  expect(update.status).toBe(401);
});

test("the demo owner's session loses access after the deadline", async ({ env }) => {
  const { browser } = await env.startDemo();
  await env.expireDemo();

  const company = await browser.graphql("query { company { id } }");
  const me = await browser.graphql("query { me { id } }");

  expect(await company.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
  expect(await me.json()).toEqual({ data: { me: null } });
});

test("refuses a demo start from another origin without cookies", async ({ env }) => {
  const response = await fetch(`${env.url}/api/auth/setup/demo`, {
    method: "POST",
    headers: { origin: "https://other.example.com" },
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_origin" });
});

test("resetting the demo gives its browser setup and revokes the old session", async ({ env }) => {
  const { browser, response: started } = await env.startDemo();
  const oldSession = sessionCookieOf(started)!;

  const response = await browser.post("/api/auth/setup/demo/reset", undefined);

  expect(response.status).toBe(200);
  expect(
    response.headers.getSetCookie().find((cookie) => cookie.startsWith("broccoli_setup=")),
  ).toMatch(/^broccoli_setup=[^;]+;/);
  expect(
    response.headers.getSetCookie().find((cookie) => cookie.includes("session_token=")),
  ).toMatch(/;\s*Max-Age=0(?:;|$)/i);
  const setup = await browser.graphql("query { me { id } setup { id step holder demoExpiresAt } }");
  expect(await setup.json()).toEqual({
    data: {
      me: null,
      setup: { id: "instance", step: "COMPANY", holder: "YOU", demoExpiresAt: null },
    },
  });
  const revoked = await fetch(`${env.url}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: env.url, cookie: oldSession },
    body: JSON.stringify({ query: "query { me { id } }" }),
  });
  expect(await revoked.json()).toEqual({ data: { me: null } });
});

test("refuses to reset a real owner's setup and keeps their session and employees", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  const employee = await env.seed.employee();

  const response = await browser.post("/api/auth/setup/demo/reset", undefined);

  expect(response.status).toBe(403);
  const unchanged = await browser.graphql(`query {
    me { id }
    setup { id step demoExpiresAt }
    employees { edges { node { id } } }
  }`);
  expect(await unchanged.json()).toEqual({
    data: {
      me: { id: user.id },
      setup: { id: "instance", step: "COMPANY", demoExpiresAt: null },
      employees: { edges: [{ node: { id: employee.id } }] },
    },
  });
});

function sessionCookieOf(response: Response): string | undefined {
  return response.headers
    .getSetCookie()
    .find((cookie) => cookie.includes("session_token="))
    ?.split(";", 1)[0];
}
