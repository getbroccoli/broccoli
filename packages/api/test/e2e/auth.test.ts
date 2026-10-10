import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { RunningServer } from "../../src/core/server";
import { createBrowser } from "./support/browser";
import { createTestDatabase, type TestDatabase } from "./support/test-databases";
import { startTestServer, waitForStartup } from "./support/test-server";

const run = inject("testRun");
const owner = { email: "owner@example.com", password: "correct horse battery staple" };

describe("owner authentication", () => {
  let database: TestDatabase;
  let server: RunningServer;
  let dataDir: string;
  let ownerId: string;

  beforeAll(async () => {
    database = await createTestDatabase(run);
    dataDir = await mkdtemp(join(tmpdir(), "broccoli-auth-"));
    server = await startTestServer(database.url, { dataDir });
    expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });
    const tokenPath = join(dataDir, "secrets", "setup-token");
    await expect(readFile(tokenPath, "utf8")).resolves.toMatch(/\S+/);
    const token = await readFile(tokenPath, "utf8");
    const response = await createBrowser(server.url).post("/api/auth/setup", { ...owner, token });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toEqual(expect.any(String));
    expect(body.user.email).toBe(owner.email);
    ownerId = body.user.id;
  });

  afterAll(async () => {
    await server?.stop();
    await database?.drop();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it("logs the owner in with the right password", async () => {
    const browser = createBrowser(server.url);

    const response = await browser.post("/api/auth/sign-in/email", owner);

    expect(response.status).toBe(200);
    const session = await browser.get("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { id: ownerId, email: owner.email } });
  });

  it("refuses a wrong password", async () => {
    const browser = createBrowser(server.url);

    const response = await browser.post("/api/auth/sign-in/email", {
      ...owner,
      password: "wrong password",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
  });

  it("ends the session on logout", async () => {
    const browser = createBrowser(server.url);
    const login = await browser.post("/api/auth/sign-in/email", owner);
    expect(login.status).toBe(200);
    const signedIn = await browser.get("/api/auth/get-session");
    expect(await signedIn.json()).toMatchObject({ user: { id: ownerId, email: owner.email } });

    const response = await browser.post("/api/auth/sign-out", {});

    expect(response.status).toBe(200);
    const session = await browser.get("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();
  });

  it("refuses sign-up", async () => {
    const response = await createBrowser(server.url).post("/api/auth/sign-up/email", {
      name: "New User",
      email: "new@example.com",
      password: owner.password,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
  });
});
