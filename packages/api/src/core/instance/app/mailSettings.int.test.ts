import {
  expect,
  fakeMail,
  mailSettings,
  MANAGED_INSTANCE_CREDENTIAL,
  EMPLOYEE,
  OWNER,
  SETUP_HOLDER,
  test,
} from "#test/support";

import { MailRefusedError } from "../../../integrations/mail";

test("reads no email on a new instance", async ({ orm }) => {
  expect(await mailSettings(orm).read(OWNER)).toEqual({
    source: "no_email",
    from: null,
    hasSecret: false,
  });
});

test("saves an SMTP server once it accepts the sign-in without returning its URL", async ({
  orm,
}) => {
  const mail = fakeMail();
  const settings = mailSettings(orm, { mail });

  const saved = await settings.save(
    OWNER,
    {
      source: "smtp_server",
      from: "broccoli@example.com",
      secret: SMTP_URL,
    },
    ORIGIN,
  );

  expect(mail.verifiedUrls).toEqual([SMTP_URL]);
  expect(mail.messages).toEqual([]);
  expect(saved).toEqual({ source: "smtp_server", from: "broccoli@example.com", hasSecret: true });
  expect(await mailSettings(orm).read(OWNER)).toEqual(saved);
});

test("keeps the earlier choice when the SMTP server refuses the sign-in", async ({ orm, seed }) => {
  await seed.mailSettings();
  const mail = fakeMail();
  mail.verificationError = new MailRefusedError(
    "Sign-in refused",
    false,
    "535 Authentication failed",
  );
  const settings = mailSettings(orm, { mail });
  const before = await settings.read(OWNER);

  await expect(
    settings.save(
      OWNER,
      {
        source: "smtp_server",
        from: "new@example.com",
        secret: SMTP_URL,
      },
      ORIGIN,
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "secret", code: "rejected" }],
  });
  expect(await settings.read(OWNER)).toEqual(before);
  await settings.sendTestEmail(OWNER);
  expect(mail.transports).toEqual([
    {
      kind: "resend_api",
      apiUrl: "http://127.0.0.1:9",
      key: "resend-key",
      from: "broccoli@example.com",
    },
  ]);
});

test.for([
  "not a URL",
  "https://smtp.example.com",
  "smtp://",
  "smtp://smtp.example.com?sendmail=true&path=/bin/echo",
])("refuses a malformed SMTP URL: %s", async (secret, { orm }) => {
  const mail = fakeMail();

  await expect(
    mailSettings(orm, { mail }).save(
      OWNER,
      {
        source: "smtp_server",
        from: "broccoli@example.com",
        secret,
      },
      ORIGIN,
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "secret", code: "invalid" }],
  });
  expect(mail.verifiedUrls).toEqual([]);
});

test("refuses a From that is no email address", async ({ orm }) => {
  await expect(
    mailSettings(orm).save(
      OWNER,
      {
        source: "resend_api",
        from: "not an email",
        secret: "resend-key",
      },
      ORIGIN,
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "from", code: "invalid" }],
  });
});

test("saves a Resend key without checking it", async ({ orm }) => {
  const mail = fakeMail();
  const settings = mailSettings(orm, { mail });

  const saved = await settings.save(
    OWNER,
    {
      source: "resend_api",
      from: "broccoli@example.com",
      secret: "resend-key",
    },
    ORIGIN,
  );

  expect(saved).toEqual({ source: "resend_api", from: "broccoli@example.com", hasSecret: true });
  expect(await settings.read(OWNER)).toEqual(saved);
  expect(mail.verifiedUrls).toEqual([]);
  expect(mail.messages).toEqual([]);
});

test("asks for a new secret when the source changes", async ({ orm, seed }) => {
  await seed.mailSettings();

  await expect(
    mailSettings(orm).save(
      OWNER,
      {
        source: "smtp_server",
        from: "broccoli@example.com",
      },
      ORIGIN,
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "secret", code: "required" }],
  });
});

test.for([undefined, null, " \n "])(
  "keeps the saved secret when saved again without one (%s)",
  async (secret, { orm, seed }) => {
    await seed.mailSettings();
    const mail = fakeMail();
    const settings = mailSettings(orm, { mail });

    await settings.save(OWNER, { source: "resend_api", from: "new@example.com", secret }, ORIGIN);
    await settings.sendTestEmail(OWNER);

    expect(mail.transports).toEqual([
      {
        kind: "resend_api",
        apiUrl: "http://127.0.0.1:9",
        key: "resend-key",
        from: "new@example.com",
      },
    ]);
  },
);

test("no email forgets the secret and keeps From", async ({ orm, seed }) => {
  await seed.mailSettings();
  const settings = mailSettings(orm);

  await settings.save(OWNER, { source: "no_email" }, ORIGIN);

  expect(await settings.read(OWNER)).toEqual({
    source: "no_email",
    from: "broccoli@example.com",
    hasSecret: false,
  });
  expect(await settings.readMailer(OWNER)).toBeNull();
  await expect(
    settings.save(
      OWNER,
      {
        source: "resend_api",
        from: "broccoli@example.com",
      },
      ORIGIN,
    ),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "secret", code: "required" }],
  });
});

test("refuses mail settings on a managed instance", async ({ orm }) => {
  const settings = mailSettings(orm, { mode: "managed" });

  await expect(settings.save(OWNER, { source: "no_email" }, ORIGIN)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(await settings.read(OWNER)).toBeNull();
});

test("a managed instance has no mailer before init", async ({ orm, seed }) => {
  const settings = mailSettings(orm, { mode: "managed" });

  expect(await settings.readMailer(OWNER)).toBeNull();
  await seed.assignment();
  expect(await settings.readMailer(OWNER)).toBeNull();
});

test("a managed instance mails through Broccoli's relay with its own origin", async ({
  orm,
  seed,
}) => {
  await seed.assignment({ instanceCredential: MANAGED_INSTANCE_CREDENTIAL });
  const mail = fakeMail();
  const settings = mailSettings(orm, {
    mode: "managed",
    mailRelayUrl: "https://relay.example.com/mail",
    mail,
  });

  const saved = await settings.readMailer(OWNER);

  expect(saved).toMatchObject({
    mailer: { send: expect.any(Function) as unknown },
    linkOrigin: "https://broccoli.example.com",
    sendsThroughBroccoli: true,
  });
  expect(mail.relayTransports).toEqual([
    { url: "https://relay.example.com/mail", credential: MANAGED_INSTANCE_CREDENTIAL },
  ]);
  expect(mail.transports).toEqual([]);
});

test.for([EMPLOYEE, SETUP_HOLDER])(
  "refuses mail settings to anyone but the owner",
  async (ctx, { orm, seed }) => {
    await seed.mailSettings();
    const settings = mailSettings(orm);

    await expect(settings.read(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settings.save(ctx, { source: "no_email" }, ORIGIN)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(settings.sendTestEmail(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settings.readMailer(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await settings.read(OWNER)).toMatchObject({ source: "resend_api", hasSecret: true });
  },
);

test("sends the test email to the owner through the saved SMTP server", async ({ orm, seed }) => {
  await seed.mailSettings({ source: "smtp_server", secret: SMTP_URL });
  const mail = fakeMail();

  await mailSettings(orm, { mail }).sendTestEmail(OWNER);

  expect(mail.transports).toEqual([
    { kind: "smtp_server", url: SMTP_URL, from: "broccoli@example.com" },
  ]);
  expect(mail.messages).toMatchObject([
    {
      template: { name: "test_email" },
      values: { origin: "https://broccoli.example.com", recipient: OWNER.user!.email },
      to: OWNER.user!.email,
      fromName: "Broccoli",
    },
  ]);
  expect(mail.messages[0]!.idempotencyKey).toEqual(expect.any(String));
});

test("reports the provider's reason when it refuses a test email", async ({ orm, seed }) => {
  await seed.mailSettings();
  const mail = fakeMail();
  mail.sendError = new MailRefusedError("Send refused", false, "Sender domain is not verified");

  const sent = mailSettings(orm, { mail }).sendTestEmail(OWNER);

  await expect(sent).rejects.toMatchObject({ code: "UNAVAILABLE" });
  await expect(sent).rejects.toThrow("Sender domain is not verified");
});

test.for([
  { publicUrl: "https://public.example.com/broccoli", origin: "https://public.example.com" },
  { publicUrl: undefined, origin: "https://saved.example.com" },
])("uses $origin for reset links", async ({ publicUrl, origin }, { orm }) => {
  const settings = mailSettings(orm, { publicUrl });
  await settings.save(
    OWNER,
    { source: "resend_api", from: "broccoli@example.com", secret: "resend-key" },
    ORIGIN,
  );

  expect(await mailSettings(orm, { publicUrl }).readMailer(OWNER)).toMatchObject({
    linkOrigin: origin,
    sendsThroughBroccoli: false,
  });
});

const SMTP_URL = "smtps://owner:password@smtp.example.com:465";
const ORIGIN = "https://saved.example.com";
