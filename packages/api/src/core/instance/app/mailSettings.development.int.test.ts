import {
  employeeInviteService,
  expect,
  fakeMail,
  mailSettings,
  OWNER,
  SYSTEM,
  test,
} from "#test/support";

import { MailRefusedError } from "../../../integrations/mail";

test("configures a fresh development instance to email invites through Mailpit", async ({
  orm,
}) => {
  const mail = fakeMail();
  const settings = mailSettings(orm, { mail });

  await settings.configureDevelopmentMail(SYSTEM, ORIGIN);

  expect(await settings.read(OWNER)).toEqual({
    source: "smtp_server",
    from: "people@example.com",
    hasSecret: true,
  });
  expect(await employeeInviteService(orm, { mail }).delivery(OWNER)).toBe("sent_by_email");
  await settings.sendTestEmail(OWNER);
  expect(mail.transports).toContainEqual({
    kind: "smtp_server",
    url: "smtp://mailpit:1025",
    from: "people@example.com",
  });
  expect(mail.messages).toHaveLength(1);
  expect(await settings.readMailer(OWNER)).toMatchObject({ linkOrigin: ORIGIN });
});

test.for(["no_email", "smtp_server", "resend_api"] as const)(
  "keeps the saved %s choice when development starts",
  async (source, { orm, seed }) => {
    await seed.mailSettings({
      source,
      secret: source === "smtp_server" ? "smtp://custom.example.com:1025" : "resend-key",
    });
    const settings = mailSettings(orm);
    const before = await settings.read(OWNER);

    await settings.configureDevelopmentMail(SYSTEM, ORIGIN);

    expect(await settings.read(OWNER)).toEqual(before);
    if (source === "no_email") {
      expect(await settings.readMailer(OWNER)).toBeNull();
    } else {
      expect(await settings.readMailer(OWNER)).toMatchObject({
        linkOrigin: "https://broccoli.example.com",
      });
    }
  },
);

test("uses the new development port for Mailpit links after a restart", async ({ orm }) => {
  const settings = mailSettings(orm);
  await settings.configureDevelopmentMail(SYSTEM, ORIGIN);

  await settings.configureDevelopmentMail(SYSTEM, "http://localhost:54322");

  expect(await settings.readMailer(OWNER)).toMatchObject({
    linkOrigin: "http://localhost:54322",
  });
});

test("does not configure Mailpit on a managed instance", async ({ orm }) => {
  await mailSettings(orm, { mode: "managed" }).configureDevelopmentMail(SYSTEM, ORIGIN);

  expect(await mailSettings(orm).read(OWNER)).toEqual({
    source: "no_email",
    from: null,
    hasSecret: false,
  });
});

test("leaves development mail unconfigured when Mailpit cannot be reached", async ({ orm }) => {
  const mail = fakeMail();
  mail.verificationError = new MailRefusedError("Connection refused", true);
  const settings = mailSettings(orm, { mail });

  await expect(settings.configureDevelopmentMail(SYSTEM, ORIGIN)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });

  expect(await settings.read(OWNER)).toEqual({
    source: "no_email",
    from: null,
    hasSecret: false,
  });
});

test("restricts development mail configuration to the system", async ({ orm }) => {
  await expect(mailSettings(orm).configureDevelopmentMail(OWNER, ORIGIN)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

const ORIGIN = "http://localhost:54321";
