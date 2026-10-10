import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, inject, it, onTestFinished } from "vitest";

import type { RunningServer } from "../../src/core/server";
import { createBrowser } from "./support/browser";
import { createTestDatabase, type TestDatabase } from "./support/test-databases";
import { startTestServer, waitForStartup } from "./support/test-server";

const run = inject("testRun");
const owner = { email: "owner@example.com", password: "correct horse battery staple" };

describe("self-hosted owner setup", () => {
  let database: TestDatabase;
  let server: RunningServer;
  let dataDir: string;
  let tokenPath: string;
  let token: string;

  beforeEach(async () => {
    database = await createTestDatabase(run);
    dataDir = await mkdtemp(join(tmpdir(), "broccoli-setup-"));
    tokenPath = join(dataDir, "secrets", "setup-token");
    server = await startTestServer(database.url, { dataDir });
    expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });
    await expect(readFile(tokenPath, "utf8")).resolves.toMatch(/\S+/);
    token = await readFile(tokenPath, "utf8");
  });

  afterEach(async () => {
    await server?.stop();
    await database?.drop();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it("creates the owner and signs them in", async () => {
    const browser = createBrowser(server.url);

    const response = await browser.post("/api/auth/setup", {
      ...owner,
      email: "OWNER@EXAMPLE.COM",
      token,
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
    const first = await createBrowser(server.url).post("/api/auth/setup", { ...owner, token });
    expect(first.status).toBe(200);

    const response = await createBrowser(server.url).post("/api/auth/setup", { ...owner, token });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "OWNER_EXISTS" });
  });

  it("sets a Secure session cookie when the public URL uses HTTPS", async () => {
    await server.stop();
    server = await startTestServer(database.url, {
      dataDir,
      publicUrl: "https://broccoli.example.com",
    });
    expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });

    const response = await fetch(`${server.url}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...owner, token }),
    });

    expect(response.status).toBe(200);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toMatch(/;\s*Secure(?:;|$)/i);
  });

  // Run with NODE_ENV=production to catch Better Auth's production cookie default.
  it("sets a session cookie without Secure when no public URL is configured", async () => {
    const response = await fetch(`${server.url}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...owner, token }),
    });

    expect(response.status).toBe(200);
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("session_token="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toMatch(/;\s*Secure(?:;|$)/i);
  });

  it("refuses a wrong token without claiming setup", async () => {
    const browser = createBrowser(server.url);

    const response = await browser.post("/api/auth/setup", { ...owner, token: "wrong-token" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_SETUP_TOKEN" });
    const retry = await browser.post("/api/auth/setup", { ...owner, token });
    expect(retry.status).toBe(200);
  });

  it("refuses a password shorter than eight characters", async () => {
    const response = await createBrowser(server.url).post("/api/auth/setup", {
      ...owner,
      token,
      password: "1234567",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });

  it("allows exactly one of two simultaneous setups", async () => {
    const responses = await Promise.all([
      createBrowser(server.url).post("/api/auth/setup", { ...owner, token }),
      createBrowser(server.url).post("/api/auth/setup", { ...owner, token }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect(await refused.json()).toMatchObject({ code: "OWNER_EXISTS" });
  });

  it("keeps a private token across restarts and removes it after setup", async () => {
    expect((await stat(tokenPath)).mode & 0o777).toBe(0o600);
    await server.stop();

    server = await startTestServer(database.url, { dataDir });

    expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });
    await expect(readFile(tokenPath, "utf8")).resolves.toBe(token);
    expect((await stat(tokenPath)).mode & 0o777).toBe(0o600);
    const response = await createBrowser(server.url).post("/api/auth/setup", { ...owner, token });
    expect(response.status).toBe(200);
    await expect(stat(tokenPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

it("creates no setup token and refuses setup in managed mode", async () => {
  const database = await createTestDatabase(run);
  onTestFinished(() => database.drop());
  const dataDir = await mkdtemp(join(tmpdir(), "broccoli-managed-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  const server = await startTestServer(database.url, { dataDir, mode: "managed" });
  onTestFinished(() => server.stop());
  expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });

  const response = await createBrowser(server.url).post("/api/auth/setup", {
    ...owner,
    token: "unused-token",
  });

  expect(response.status).toBe(404);
  await expect(stat(join(dataDir, "secrets", "setup-token"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
