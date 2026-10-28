import {
  expect,
  RESEND_CHOICE,
  SAVE_MAIL_SETTINGS,
  startMailTestEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("the owner saves Resend, reads the choice without its key and receives a test email", async () => {
  const { env, owner, resend } = await startMailTestEnv();

  const saved = await owner.graphql(SAVE_MAIL_SETTINGS, { input: RESEND_CHOICE });

  expect(await saved.json()).toEqual({
    data: {
      setup: {
        saveMailSettings: {
          setup: {
            id: "instance",
            mail: {
              id: "mail",
              source: "RESEND_API",
              from: "broccoli@example.com",
              hasSecret: true,
            },
            passwordResetByEmail: true,
          },
          error: null,
        },
      },
    },
  });
  expect(
    await (await owner.graphql("query { setup { id mail { id source from hasSecret } } }")).json(),
  ).toEqual({
    data: {
      setup: {
        id: "instance",
        mail: { id: "mail", source: "RESEND_API", from: "broccoli@example.com", hasSecret: true },
      },
    },
  });
  expect(
    await (await env.browser().graphql("query { setup { id passwordResetByEmail } }")).json(),
  ).toEqual({
    data: { setup: { id: "instance", passwordResetByEmail: true } },
  });
  const sent = await owner.graphql(`mutation {
    setup { sendTestEmail { setup { id } error { __typename ... on Error { message } } } }
  }`);
  expect(await sent.json()).toEqual({
    data: { setup: { sendTestEmail: { setup: { id: "instance" }, error: null } } },
  });
  expect(resend.emails).toHaveLength(1);
  expect(resend.emails[0]).toMatchObject({
    headers: { authorization: "Bearer resend-key" },
    body: {
      from: '"Broccoli" <broccoli@example.com>',
      to: [TEST_OWNER.email],
      subject: "Broccoli can send email",
    },
  });
  expect(resend.emails[0]!.headers["idempotency-key"]).toEqual(expect.any(String));
  expect(resend.emails[0]!.body.text).toContain("This test email");
});
