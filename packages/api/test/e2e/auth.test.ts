import { expect, TEST_OWNER, test } from "./support";

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

test("refuses sign-up", async ({ env }) => {
  const response = await env.browser().post("/api/auth/sign-up/email", {
    name: "New User",
    email: "new@example.com",
    password: TEST_OWNER.password,
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
});
