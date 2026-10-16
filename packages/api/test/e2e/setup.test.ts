import { createBrowser, expect, PNG, TEST_OWNER, test } from "#test/support";

test("a fresh instance reports the company step and nobody holding setup", async ({ env }) => {
  const response = await env.browser().graphql("query { setup { id step holder } }");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { setup: { id: "instance", step: "COMPANY", holder: "NOBODY" } },
  });
});

test("the first browser starts setup with a private three-day cookie", async ({ env }) => {
  const browser = env.browser();

  const response = await browser.post("/api/auth/setup/start", undefined);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ holder: "you" });
  const cookie = setupCookieOf(response);
  expect(cookie).toMatch(/^broccoli_setup=[^;]+;/);
  expect(cookie).toMatch(/;\s*Max-Age=259200(?:;|$)/i);
  expect(cookie).toMatch(/;\s*Path=\/(?:;|$)/i);
  expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
  expect(cookie).not.toMatch(/;\s*Secure(?:;|$)/i);
  const setup = await browser.graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({ data: { setup: { id: "instance", holder: "YOU" } } });
});

test("a second browser is refused setup and private company access", async ({ env }) => {
  await env.browser().post("/api/auth/setup/start", undefined);
  const another = env.browser();

  const response = await another.post("/api/auth/setup/start", undefined);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SETUP_IN_PROGRESS" });
  const setup = await another.graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({
    data: { setup: { id: "instance", holder: "ANOTHER_DEVICE" } },
  });
  const company = await another.graphql("query { company { id } }");
  expect(await company.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("the setup holder names the company through GraphQL", async ({ env }) => {
  const browser = env.browser();
  await browser.post("/api/auth/setup/start", undefined);

  const response = await browser.graphql(`
    mutation { company { update(input: { name: "Acme Corp" }) { company { id name } error { __typename ... on Error { message } } } } }
  `);

  expect(await response.json()).toEqual({
    data: {
      company: {
        update: {
          company: { id: "company", name: "Acme Corp" },
          error: null,
        },
      },
    },
  });
  const company = await browser.graphql("query { company { id name } }");
  expect(await company.json()).toEqual({ data: { company: { id: "company", name: "Acme Corp" } } });
});

test("the setup holder can upload and read the company logo through REST", async ({ env }) => {
  const browser = env.browser();
  await browser.post("/api/auth/setup/start", undefined);

  const response = await browser.put("/api/company/logo", PNG);

  expect(response.status).toBe(200);
  const { logoUrl } = (await response.json()) as { logoUrl: string };
  const logo = await browser.get(logoUrl);
  expect(logo.status).toBe(200);
  expect(Buffer.from(await logo.arrayBuffer())).toEqual(PNG);
});

test("the setup cookie grants no access to employees", async ({ env }) => {
  const browser = env.browser();
  await browser.post("/api/auth/setup/start", undefined);

  const response = await browser.graphql("query { employees { edges { node { id } } } }");

  expect(await response.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});

test("completes setup and replaces setup access with the owner's signed-in session", async ({
  env,
}) => {
  const browser = env.browser();
  const started = await browser.post("/api/auth/setup/start", undefined);
  expect(started.status).toBe(200);
  const oldCookie = setupCookieOf(started)!.split(";", 1)[0]!;
  const named = await browser.graphql(`
    mutation { company { update(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } } }
  `);
  expect(await named.json()).toEqual({
    data: { company: { update: { company: { id: "company" }, error: null } } },
  });
  const skipped = await browser.graphql("mutation { import { skip { import { id } } } }");
  expect(await skipped.json()).toEqual({
    data: { import: { skip: { import: { id: "import" } } } },
  });

  const response = await browser.post("/api/auth/setup", {
    ...TEST_OWNER,
    email: "OWNER@EXAMPLE.COM",
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string; email: string } };
  expect(body.user.id).toEqual(expect.any(String));
  expect(body.user.email).toBe(TEST_OWNER.email);
  expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token="))).toBe(
    true,
  );
  expect(setupCookieOf(response)).toMatch(/;\s*Max-Age=0(?:;|$)/i);
  const signedIn = await browser.graphql("query { me { id isOwner } setup { id step holder } }");
  expect(await signedIn.json()).toEqual({
    data: {
      me: { id: body.user.id, isOwner: true },
      setup: { id: "instance", step: "DONE", holder: "NOBODY" },
    },
  });
  const stale = await fetch(`${env.url}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: oldCookie },
    body: JSON.stringify({ query: "query { company { id } }" }),
  });
  expect(await stale.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("owner creation without the setup cookie is refused", async ({ env }) => {
  const response = await env.browser().post("/api/auth/setup", TEST_OWNER);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SETUP_IN_PROGRESS" });
});

test("reports the owner-step error through the auth endpoint", async ({ env }) => {
  const browser = env.browser();
  await browser.post("/api/auth/setup/start", undefined);

  const response = await browser.post("/api/auth/setup", TEST_OWNER);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "NOT_AT_OWNER_STEP" });
});

test("renews the setup cookie when the holder starts again", async ({ env }) => {
  const browser = env.browser();
  const first = await browser.post("/api/auth/setup/start", undefined);

  const renewed = await browser.post("/api/auth/setup/start", undefined);

  expect(renewed.status).toBe(200);
  expect(setupCookieOf(renewed)!.split(";", 1)[0]).toBe(setupCookieOf(first)!.split(";", 1)[0]);
  expect(setupCookieOf(renewed)).toMatch(/;\s*Max-Age=259200(?:;|$)/i);
});

test.for(["/api/auth/setup/start", "/api/auth/setup"])(
  "refuses %s once an owner exists",
  async (path, { env }) => {
    await env.signInAsOwner();

    const response = await env
      .browser()
      .post(path, path.endsWith("start") ? undefined : TEST_OWNER);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "OWNER_EXISTS" });
  },
);

test("sets a Secure setup cookie when the public URL uses HTTPS", async ({ env }) => {
  await env.restart({ publicUrl: "https://broccoli.example.com" });

  const response = await createBrowser(env.url, "https://broccoli.example.com").post(
    "/api/auth/setup/start",
    undefined,
  );

  expect(response.status).toBe(200);
  expect(setupCookieOf(response)).toMatch(/;\s*Secure(?:;|$)/i);
});

test("keeps the owner's session across a restart", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();

  await env.restart();

  const session = await browser.get(`${env.url}/api/auth/get-session`);
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user });
});

test("refuses a setup start from another origin without cookies and leaves setup unclaimed", async ({
  env,
}) => {
  const response = await fetch(`${env.url}/api/auth/setup/start`, {
    method: "POST",
    headers: { origin: "https://other.example.com" },
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_origin" });
  const setup = await env.browser().graphql("query { setup { id holder } }");
  expect(await setup.json()).toEqual({ data: { setup: { id: "instance", holder: "NOBODY" } } });
});

test("refuses a setup start without an Origin header", async ({ env }) => {
  const response = await fetch(`${env.url}/api/auth/setup/start`, { method: "POST" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "cross_origin" });
});

test("refuses the eleventh setup start even when each request changes X-Forwarded-For", async ({
  env,
}) => {
  for (let request = 0; request < 10; request++) {
    const response = await fetch(`${env.url}/api/auth/setup/start`, {
      method: "POST",
      headers: { origin: env.url, "x-forwarded-for": `192.0.2.${request + 1}` },
    });
    expect(response.status).toBe(request === 0 ? 200 : 409);
  }

  const response = await fetch(`${env.url}/api/auth/setup/start`, {
    method: "POST",
    headers: { origin: env.url, "x-forwarded-for": "192.0.2.11" },
  });

  expect(response.status).toBe(429);
});

function setupCookieOf(response: Response): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.startsWith("broccoli_setup="));
}
