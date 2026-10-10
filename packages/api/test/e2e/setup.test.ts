import { afterEach, beforeEach, describe, expect, inject, it, onTestFinished } from "vitest";

import { createBrowser } from "./support/browser";
import { TestInstance } from "./support/test-instance";

const run = inject("testRun");
const owner = { email: "owner@example.com", password: "correct horse battery staple" };

describe("self-hosted owner setup", () => {
  let instance: TestInstance;

  beforeEach(async () => {
    instance = await TestInstance.start(run);
  });

  afterEach(() => instance.stop());

  it("creates the owner and signs them in", async () => {
    const browser = createBrowser(instance.url);

    const response = await browser.post("/api/auth/setup", {
      ...owner,
      email: "OWNER@EXAMPLE.COM",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toEqual(expect.any(String));
    expect(body.user.email).toBe(owner.email);
    const session = await browser.get("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: body.user });
  });

  it("refuses a second setup", async () => {
    const first = await createBrowser(instance.url).post("/api/auth/setup", owner);
    expect(first.status).toBe(200);

    const response = await createBrowser(instance.url).post("/api/auth/setup", owner);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "OWNER_EXISTS" });
  });

  it("sets a Secure session cookie when the public URL uses HTTPS", async () => {
    await instance.restart({ publicUrl: "https://broccoli.example.com" });

    const response = await fetch(`${instance.url}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(owner),
    });

    expect(response.status).toBe(200);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toMatch(/;\s*Secure(?:;|$)/i);
  });

  // Run with NODE_ENV=production to catch Better Auth's production cookie default.
  it("sets a session cookie without Secure when no public URL is configured", async () => {
    const response = await fetch(`${instance.url}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(owner),
    });

    expect(response.status).toBe(200);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toMatch(/;\s*Secure(?:;|$)/i);
  });

  it("refuses a password shorter than eight characters", async () => {
    const response = await createBrowser(instance.url).post("/api/auth/setup", {
      ...owner,
      password: "1234567",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("allows exactly one of two simultaneous setups", async () => {
    const responses = await Promise.all([
      createBrowser(instance.url).post("/api/auth/setup", owner),
      createBrowser(instance.url).post("/api/auth/setup", owner),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect(await refused.json()).toMatchObject({ code: "OWNER_EXISTS" });
  });

  it("keeps the owner's session across a restart", async () => {
    const browser = createBrowser(instance.url);
    const response = await browser.post("/api/auth/setup", owner);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string; email: string } };

    await instance.restart();

    const session = await browser.get(`${instance.url}/api/auth/get-session`);
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: body.user });
  });
});

it("refuses setup in managed mode", async () => {
  const instance = await TestInstance.start(run, { mode: "managed" });
  onTestFinished(() => instance.stop());

  const response = await createBrowser(instance.url).post("/api/auth/setup", owner);

  expect(response.status).toBe(404);
});
