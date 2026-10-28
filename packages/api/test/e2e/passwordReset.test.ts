import {
  expect,
  RESEND_CHOICE,
  SAVE_MAIL_SETTINGS,
  startMailTestEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("a person resets their password by email, ending old sessions and signing in with the new password", async () => {
  const { env, owner, resend } = await startMailTestEnv();
  const saved = await owner.graphql(SAVE_MAIL_SETTINGS, { input: RESEND_CHOICE });
  expect(await saved.json()).toMatchObject({
    data: { setup: { saveMailSettings: { error: null } } },
  });
  const browser = env.browser();

  const requested = await browser.post("/api/auth/request-password-reset", {
    email: TEST_OWNER.email,
  });
  expect(requested.status).toBe(200);
  expect(await requested.json()).toMatchObject({ status: true });
  await expect.poll(() => resend.emails.length, { timeout: 15_000 }).toBe(1);
  expect(resend.emails[0]!.body.to).toEqual([TEST_OWNER.email]);
  const link = new URL(resend.emails[0]!.body.text.match(/https?:\/\/\S+/)![0]);
  expect(link.origin).toBe(env.url);
  expect(link.pathname).toBe("/reset-password");
  const token = link.hash.slice(1);
  expect(token).not.toBe("");
  const reset = await browser.post("/api/auth/reset-password", {
    newPassword: "a new correct horse battery staple",
    token,
  });

  expect(reset.status).toBe(200);
  expect(await (await owner.graphql("query { company { id } }")).json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
  const signedIn = await browser.post("/api/auth/sign-in/email", {
    email: TEST_OWNER.email,
    password: "a new correct horse battery staple",
  });
  expect(signedIn.status).toBe(200);
  expect(await (await browser.get("/api/auth/get-session")).json()).toMatchObject({
    user: { email: TEST_OWNER.email },
  });
  expect(
    (
      await env.browser().post("/api/auth/reset-password", {
        newPassword: "another correct horse battery staple",
        token,
      })
    ).status,
  ).toBe(400);
});

test("asking for an unknown address answers the same and emails nothing", async () => {
  const { env, owner, resend } = await startMailTestEnv();
  const saved = await owner.graphql(SAVE_MAIL_SETTINGS, { input: RESEND_CHOICE });
  expect(await saved.json()).toMatchObject({
    data: { setup: { saveMailSettings: { error: null } } },
  });
  const browser = env.browser();

  const unknown = await browser.post("/api/auth/request-password-reset", {
    email: "unknown@example.com",
  });
  const known = await browser.post("/api/auth/request-password-reset", { email: TEST_OWNER.email });

  expect(unknown.status).toBe(200);
  expect(known.status).toBe(200);
  const answer = await known.json();
  expect(answer).toMatchObject({ status: true });
  expect(await unknown.json()).toEqual(answer);
  await expect.poll(() => resend.emails.length, { timeout: 15_000 }).toBe(1);
  expect(resend.emails.map(({ body }) => body.to)).toEqual([[TEST_OWNER.email]]);
});

test("limits password reset requests to five a minute per IP address", async () => {
  const { env } = await startMailTestEnv();
  const browser = env.browser();

  for (let request = 0; request < 5; request++) {
    expect(
      (await browser.post("/api/auth/request-password-reset", { email: TEST_OWNER.email })).status,
    ).toBe(200);
  }
  const limited = await env
    .browser()
    .post("/api/auth/request-password-reset", { email: TEST_OWNER.email });

  expect(limited.status).toBe(429);
  expect(
    (await browser.post("/api/auth/request-password-reset", { email: "another@example.com" }))
      .status,
  ).toBe(429);
});
