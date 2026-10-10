import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createBrowser } from "./support/browser";
import { TestInstance } from "./support/test-instance";

const run = inject("testRun");
const owner = { email: "owner@example.com", password: "correct horse battery staple" };

describe("owner authentication", () => {
  let instance: TestInstance;
  let ownerId: string;

  beforeAll(async () => {
    instance = await TestInstance.start(run);
    const token = await instance.readSetupToken();
    const response = await createBrowser(instance.url).post("/api/auth/setup", { ...owner, token });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    ownerId = body.user.id;
  });

  afterAll(() => instance.stop());

  it("logs the owner in with the right password", async () => {
    const browser = createBrowser(instance.url);

    const response = await browser.post("/api/auth/sign-in/email", owner);

    expect(response.status).toBe(200);
    const session = await browser.get("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { id: ownerId, email: owner.email } });
  });

  it("refuses a wrong password", async () => {
    const browser = createBrowser(instance.url);

    const response = await browser.post("/api/auth/sign-in/email", {
      ...owner,
      password: "wrong password",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
  });

  it("ends the session on logout", async () => {
    const browser = createBrowser(instance.url);
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
    const response = await createBrowser(instance.url).post("/api/auth/sign-up/email", {
      name: "New User",
      email: "new@example.com",
      password: owner.password,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
  });
});
