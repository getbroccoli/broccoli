import { randomUUID } from "node:crypto";

import { ApplicationError, invalidInput } from "../../applicationError";
import type { Orm, Transact } from "../../db";
import type { Deployment } from "../../env";
import type { Logger } from "../../logger";
import type { SecretBox } from "../../secrets";
import type { SecurityContext } from "../../security";
import {
  createMailer,
  MailRefusedError,
  type Mailer,
  type MailTransport,
  verifySmtpServer,
} from "../../../integrations/mail";
import { instanceRepository } from "../db";
import { decideMailSettings, type MailChoice, type MailConfig } from "../domain";
import { TEST_EMAIL_TEMPLATE } from "./mailTest.email";

/**
 * How a self-hosted instance sends email: the owner's SMTP server, their Resend key, or no email.
 * A managed instance never sees or saves the choice.
 */
export interface MailSettings {
  /** The saved choice; null on a managed instance. */
  read(ctx: SecurityContext): Promise<MailConfig | null>;
  /** Checks the choice, then saves it with the origin its links use; a managed instance refuses. */
  save(ctx: SecurityContext, choice: MailChoice, linkOrigin: string): Promise<MailConfig>;
  /** Development startup chooses Mailpit once and keeps its links on the current dev port. */
  configureDevelopmentMail(ctx: SecurityContext, linkOrigin: string): Promise<void>;
  /** Sends the caller a test email with the saved choice. */
  sendTestEmail(ctx: SecurityContext): Promise<void>;
  /** The saved choice's mailer and the origin its links use; null without email or on managed. */
  readMailer(ctx: SecurityContext): Promise<{ mailer: Mailer; linkOrigin: string } | null>;
}

/** The mail integration, which use-case tests replace with a fake. */
export interface MailIntegration {
  createMailer: (transport: MailTransport) => Mailer;
  verifySmtpServer: (url: string) => Promise<void>;
}

export function createMailSettings({
  orm,
  transact,
  secretBox,
  deployment,
  logger,
  resendApiUrl,
  mail = { createMailer, verifySmtpServer },
}: {
  orm: Orm;
  transact: Transact;
  secretBox: SecretBox;
  deployment: Deployment;
  logger: Logger;
  /** Resend's API, `https://api.resend.com` in production. */
  resendApiUrl: string;
  mail?: MailIntegration;
}): MailSettings {
  // `SELF_HOSTED_PUBLIC_URL` wins over the origin the owner saved from.
  const publicOrigin =
    deployment.mode === "self_hosted" && deployment.publicUrl
      ? new URL(deployment.publicUrl).origin
      : null;
  const readMailer = () => readSavedMailer(orm, { secretBox, mail, resendApiUrl, publicOrigin });

  return {
    read: async (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      return deployment.mode === "managed"
        ? null
        : withoutOrigin(await instanceRepository(orm).readMailSettings());
    },

    save: async (ctx, choice, linkOrigin) => {
      ctx.require("MANAGE_WORKSPACE");
      if (deployment.mode === "managed") {
        throw new ApplicationError("CONFLICT", "A managed instance sends email through Broccoli.");
      }
      const change = decideMailSettings(choice, await instanceRepository(orm).readMailSettings());
      if (change.source === "smtp_server" && typeof change.secret === "string") {
        await checkSmtpServer(mail, change.secret, logger);
      }
      await transact(async (tx) => {
        const repository = instanceRepository(tx);
        await repository.lockInstance();
        // Another save may have changed the source since the check; a kept secret must still be its own.
        const locked = decideMailSettings(choice, await repository.readMailSettings());
        await repository.storeMailSettings({
          source: locked.source,
          from: locked.from,
          encryptedSecret:
            locked.secret === undefined
              ? (await repository.readMailSender()).encryptedSecret
              : locked.secret === null
                ? null
                : secretBox.encrypt(locked.secret),
          linkOrigin: publicOrigin ?? linkOrigin,
        });
      });
      logger.info({ mailSource: change.source }, "Mail choice saved");
      return withoutOrigin(await instanceRepository(orm).readMailSettings());
    },

    configureDevelopmentMail: async (ctx, linkOrigin) => {
      ctx.requireSystem();
      if (deployment.mode === "managed") return;
      if ((await instanceRepository(orm).readInstance()).mailSource === null) {
        await checkSmtpServer(mail, MAILPIT_URL, logger);
      }
      await transact(async (tx) => {
        const repository = instanceRepository(tx);
        const instance = await repository.lockInstance();
        if (instance.mailSource === null) {
          await repository.storeMailSettings({
            source: "smtp_server",
            from: "people@example.com",
            encryptedSecret: secretBox.encrypt(MAILPIT_URL),
            linkOrigin,
          });
        } else if (instance.mailSource === "smtp_server") {
          const saved = await repository.readMailSender();
          if (saved.encryptedSecret && secretBox.decrypt(saved.encryptedSecret) === MAILPIT_URL) {
            await repository.storeMailSettings({ ...saved, linkOrigin });
          }
        }
      });
    },

    sendTestEmail: async (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      const caller = ctx.user;
      const saved = deployment.mode === "managed" || caller === null ? null : await readMailer();
      if (caller === null || saved === null) {
        throw new ApplicationError("CONFLICT", "Choose how Broccoli sends email first.");
      }
      try {
        const { messageId } = await saved.mailer.send({
          template: TEST_EMAIL_TEMPLATE,
          values: {},
          to: caller.email,
          fromName: "Broccoli",
          idempotencyKey: randomUUID(),
        });
        logger.info({ messageId }, "Test email sent");
      } catch (error) {
        throw testEmailRefusal(error, logger);
      }
    },

    readMailer: async (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      return deployment.mode === "managed" ? null : readMailer();
    },
  };
}

const MAILPIT_URL = "smtp://mailpit:1025";

/** The saved choice's mailer and link origin, from one read so the secret matches its source. */
async function readSavedMailer(
  orm: Orm,
  {
    secretBox,
    mail,
    resendApiUrl,
    publicOrigin,
  }: {
    secretBox: SecretBox;
    mail: MailIntegration;
    resendApiUrl: string;
    publicOrigin: string | null;
  },
): Promise<{ mailer: Mailer; linkOrigin: string } | null> {
  const { source, from, encryptedSecret, linkOrigin } =
    await instanceRepository(orm).readMailSender();
  if (source === "no_email" || from === null || encryptedSecret === null) {
    return null;
  }
  const secret = secretBox.decrypt(encryptedSecret);
  const transport: MailTransport =
    source === "smtp_server"
      ? { kind: source, url: secret, from }
      : { kind: source, apiUrl: resendApiUrl, key: secret, from };
  return {
    mailer: mail.createMailer(transport),
    // A choice is always saved with an origin; the fallback only satisfies the type.
    linkOrigin: publicOrigin ?? linkOrigin ?? "",
  };
}

/** Longest provider reason shown to the owner. */
const MAX_REASON_LENGTH = 300;

function withoutOrigin({ source, from, hasSecret }: MailConfig): MailConfig {
  return { source, from, hasSecret };
}

async function checkSmtpServer(mail: MailIntegration, url: string, logger: Logger): Promise<void> {
  try {
    await mail.verifySmtpServer(url);
  } catch (error) {
    if (!(error instanceof MailRefusedError)) {
      throw error;
    }
    logger.warn({ kind: error.message, retryable: error.retryable }, "SMTP server check refused");
    throw error.retryable
      ? new ApplicationError("UNAVAILABLE", "The mail server could not be reached. Try again.")
      : invalidInput([{ field: "secret", code: "rejected" }]);
  }
}

function testEmailRefusal(error: unknown, logger: Logger): unknown {
  if (!(error instanceof MailRefusedError)) {
    return error;
  }
  logger.warn({ kind: error.message, retryable: error.retryable }, "Test email refused");
  const reason = (error.providerReason ?? error.message).slice(0, MAX_REASON_LENGTH);
  // The provider's reason is the message, for the owner who chose the provider.
  return new ApplicationError("UNAVAILABLE", reason);
}
