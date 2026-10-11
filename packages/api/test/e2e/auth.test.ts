import { expect, TEST_OWNER, test } from "#test/support";

test("logs the owner in with the right password", async ({ env }) => {
  const { user } = await env.signInAsOwner();
  const browser = env.browser();

  const response = await browser.post("/api/auth/sign-in/email", TEST_OWNER);

  expect(response.status).toBe(200);
  const session = await browser.get("/api/auth/get-session");
  expect(await session.json()).toMatchObject({ user });
});

test("refuses a wrong password", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().post("/api/auth/sign-in/email", {
    ...TEST_OWNER,
    password: "wrong password",
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
});

test("ends the session on logout", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.post("/api/auth/sign-out", {});

  expect(response.status).toBe(200);
  const session = await browser.get("/api/auth/get-session");
  expect(session.status).toBe(200);
  expect(await session.json()).toBeNull();
});

test("refuses a sign-in from another origin", async ({ env }) => {
  await env.signInAsOwner();

  const response = await fetch(new URL("/api/auth/sign-in/email", env.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example.com" },
    body: JSON.stringify(TEST_OWNER),
  });

  expect(response.status).toBe(403);
});

test("the old cookie no longer resolves after logout", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const signIn = await browser.post("/api/auth/sign-in/email", TEST_OWNER);
  const cookie = signIn.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="))
    ?.split(";", 1)[0];
  expect(cookie).toBeDefined();

  await browser.post("/api/auth/sign-out", {});
  const response = await fetch(new URL("/api/graphql", env.url), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie! },
    body: JSON.stringify({ query: "{ me { id } }" }),
  });

  expect(await response.json()).toEqual({ data: { me: null } });
});

test("refuses sign-up", async ({ env }) => {
  const response = await env.browser().post("/api/auth/sign-up/email", {
    name: "New User",
    email: "new@example.com",
    password: TEST_OWNER.password,
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
});
