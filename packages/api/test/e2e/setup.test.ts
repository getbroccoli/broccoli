import { onTestFinished } from "vitest";

import { expect, TEST_OWNER, TestEnv, test } from "./support";

const SECURE_ATTRIBUTE = /;\s*Secure(?:;|$)/i;

function sessionCookieOf(response: Response): string | undefined {
  return response.headers.getSetCookie().find((cookie) => cookie.includes("session_token="));
}

test("creates the owner and signs them in", async ({ env }) => {
  const browser = env.browser();

  const response = await browser.post("/api/auth/setup", {
    ...TEST_OWNER,
    email: "OWNER@EXAMPLE.COM",
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as { user: { id: string; email: string } };
  expect(body.user.id).toEqual(expect.any(String));
  expect(body.user.email).toBe(TEST_OWNER.email);
  const session = await browser.get("/api/auth/get-session");
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user: body.user });
});

test("refuses a second setup", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().post("/api/auth/setup", TEST_OWNER);

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "OWNER_EXISTS" });
});

test("sets a Secure session cookie when the public URL uses HTTPS", async ({ env }) => {
  await env.restart({ publicUrl: "https://broccoli.example.com" });

  // A plain request: the browser's Origin would not match the https public URL.
  const response = await fetch(`${env.url}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(TEST_OWNER),
  });

  expect(response.status).toBe(200);
  expect(sessionCookieOf(response)).toMatch(SECURE_ATTRIBUTE);
});

// Run with NODE_ENV=production to catch Better Auth's production cookie default.
test("sets a session cookie without Secure when no public URL is configured", async ({ env }) => {
  const response = await env.browser().post("/api/auth/setup", TEST_OWNER);

  expect(response.status).toBe(200);
  expect(sessionCookieOf(response)).toBeDefined();
  expect(sessionCookieOf(response)).not.toMatch(SECURE_ATTRIBUTE);
});

test("refuses a password shorter than eight characters", async ({ env }) => {
  const response = await env.browser().post("/api/auth/setup", {
    ...TEST_OWNER,
    password: "1234567",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
});

test("allows exactly one of two simultaneous setups", async ({ env }) => {
  const responses = await Promise.all([
    env.browser().post("/api/auth/setup", TEST_OWNER),
    env.browser().post("/api/auth/setup", TEST_OWNER),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const refused = responses.find((response) => response.status === 409)!;
  expect(await refused.json()).toMatchObject({ code: "OWNER_EXISTS" });
});

test("keeps the owner's session across a restart", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();

  await env.restart();

  // The restarted server listens on a new port.
  const session = await browser.get(`${env.url}/api/auth/get-session`);
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user });
});

test("refuses setup in managed mode", async () => {
  const env = await TestEnv.start({ mode: "managed" });
  onTestFinished(() => env.stop());

  const response = await env.browser().post("/api/auth/setup", TEST_OWNER);

  expect(response.status).toBe(404);
});
