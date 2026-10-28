import { createHash } from "node:crypto";

import type { Orm, Transact } from "../../db";
import type { JobHandlers, JobQueue } from "../../jobs";
import type { Logger } from "../../logger";
import type { SecretBox } from "../../secrets";
import { PrincipalSecurityContext, type SecurityContext } from "../../security";
import { type EmailTemplate, escapeHtml, MailRefusedError } from "../../../integrations/mail";
import { readPasswordUserEmail } from "../db";
import type { MailSettings } from "./mailSettings";

/**
 * Emails the link of Better Auth's password reset, from a job so every address answers alike and
 * a failed send retries. Only a user with a password gets one, and only while email is chosen.
 */
export interface PasswordResetEmail {
  /** Better Auth's `sendResetPassword`, as the system: queues the email, or does nothing. */
  queue(ctx: SecurityContext, user: { id: string }, token: string): Promise<void>;
  /** Sends the queued email. */
  jobs: JobHandlers;
}

/** One reset email; the token is encrypted, so the job queue never holds it in plain text. */
export interface PasswordResetEmailJob {
  userId: string;
  encryptedToken: string;
}

declare module "../../jobs" {
  interface Jobs {
    "instance.sendPasswordResetEmail": PasswordResetEmailJob;
  }
}

export function createPasswordResetEmail({
  orm,
  transact,
  jobs,
  secretBox,
  mailSettings,
  logger,
}: {
  orm: Orm;
  transact: Transact;
  jobs: JobQueue;
  secretBox: SecretBox;
  mailSettings: MailSettings;
  logger: Logger;
}): PasswordResetEmail {
  // The job runs on its own.
  const system = PrincipalSecurityContext.system();
  return {
    queue: async (ctx, user, token) => {
      ctx.requireOwnerOrSystem();
      const mail = await mailSettings.read(system);
      if (mail === null || mail.source === "no_email") {
        return;
      }
      // Without a password the user, such as the demo's owner, would gain one through the reset.
      if ((await readPasswordUserEmail(orm, user.id)) === null) {
        return;
      }
      await transact((tx) =>
        jobs.send(tx, "instance.sendPasswordResetEmail", {
          userId: user.id,
          encryptedToken: secretBox.encrypt(token),
        }),
      );
      logger.info({ userId: user.id }, "Password reset email queued");
    },

    jobs: {
      "instance.sendPasswordResetEmail": {
        run: async ({ userId, encryptedToken }) => {
          const email = await readPasswordUserEmail(orm, userId);
          const saved = await mailSettings.readMailer(system);
          if (email === null || saved === null) {
            logger.info({ userId }, "Password reset email dropped: no password or no email");
            return;
          }
          const token = secretBox.decrypt(encryptedToken);
          try {
            const { messageId } = await saved.mailer.send({
              template: PASSWORD_RESET_TEMPLATE,
              values: { resetLink: `${saved.linkOrigin}/reset-password#${token}` },
              to: email,
              fromName: "Broccoli",
              idempotencyKey: createHash("sha256").update(token).digest("hex"),
            });
            logger.info({ userId, messageId }, "Password reset email sent");
          } catch (error) {
            if (!(error instanceof MailRefusedError) || error.retryable) {
              throw error;
            }
            logger.warn({ userId, kind: error.message }, "Password reset email refused");
          }
        },
        onFailed: ({ userId }) => {
          logger.error({ userId }, "Password reset email failed after retries");
          return Promise.resolve();
        },
      },
    },
  };
}

const PASSWORD_RESET_TEMPLATE: EmailTemplate<{ resetLink: string }> = {
  name: "password_reset",
  render: ({ resetLink }) => {
    const intro = "Someone asked to reset the password of your Broccoli account.";
    const expiry = "The link works once, for one hour. If it wasn't you, ignore this email.";
    return {
      subject: "Reset your Broccoli password",
      text: [intro, `Choose a new password: ${resetLink}`, expiry].join("\n\n"),
      html: [
        `<p>${escapeHtml(intro)}</p>`,
        `<p><a href="${escapeHtml(resetLink)}">Choose a new password</a></p>`,
        `<p>${escapeHtml(expiry)}</p>`,
      ].join("\n"),
    };
  },
};
