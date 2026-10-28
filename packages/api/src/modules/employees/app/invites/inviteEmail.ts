import type { Orm } from "../../../../core/db";
import type { JobHandlers } from "../../../../core/jobs";
import type { Logger } from "../../../../core/logger";
import type { SecretBox } from "../../../../core/secrets";
import {
  type EmailTemplate,
  escapeHtml,
  MailRefusedError,
  type Mailer,
} from "../../../../integrations/mail";
import { employeeRepository, inviteRepository } from "../../db";
import { inviteLink, isOpen } from "../../domain";

/** One invite email; the token is encrypted, so the job queue never holds it in plain text. */
export interface SendInviteJob {
  inviteId: string;
  encryptedToken: string;
}

/**
 * Emails one invite with the mail choice saved when the job runs. A refusal, no email chosen, or
 * the last failed retry marks the invite not sent; a closed invite or removed person sends nothing.
 */
export function sendInviteJob({
  orm,
  logger,
  secretBox,
  readMailer,
  readCompanyName,
}: {
  orm: Orm;
  logger: Logger;
  secretBox: SecretBox;
  readMailer: () => Promise<{ mailer: Mailer; linkOrigin: string } | null>;
  readCompanyName: () => Promise<string>;
}): JobHandlers {
  const invites = inviteRepository(orm);
  return {
    "employees.sendInvite": {
      run: async ({ inviteId, encryptedToken }) => {
        const invite = await invites.findById(inviteId);
        if (!invite || !isOpen(invite)) {
          logger.info({ inviteId }, "Invite email dropped: the invite is closed");
          return;
        }
        const saved = await readMailer();
        if (!saved) {
          await invites.markSendFailed(inviteId, new Date());
          logger.warn({ inviteId }, "Invite email not sent: no email is chosen");
          return;
        }
        const [employee, inviter, companyName] = await Promise.all([
          employeeRepository(orm).findById(invite.employeeId),
          invite.invitedByUserId ? invites.findInviter(invite.invitedByUserId) : null,
          readCompanyName(),
        ]);
        if (!employee) {
          logger.info({ inviteId }, "Invite email dropped: the person was removed");
          return;
        }
        const token = secretBox.decrypt(encryptedToken);
        try {
          const { messageId } = await saved.mailer.send({
            template: INVITE_TEMPLATE,
            values: {
              firstName: employee.firstName,
              inviterName: inviter?.name ?? null,
              companyName,
              note: invite.note,
              link: inviteLink(saved.linkOrigin, token),
              expiresAt: invite.expiresAt,
            },
            to: invite.email,
            fromName: inviter?.name ? `${inviter.name} via ${companyName}` : companyName,
            idempotencyKey: inviteId,
          });
          logger.info({ inviteId, messageId }, "Invite email sent");
        } catch (error) {
          if (!(error instanceof MailRefusedError) || error.retryable) {
            throw error;
          }
          await invites.markSendFailed(inviteId, new Date());
          logger.warn({ inviteId, kind: error.message }, "Invite email refused");
        }
      },
      onFailed: async ({ inviteId }) => {
        await invites.markSendFailed(inviteId, new Date());
        logger.error({ inviteId }, "Invite email failed after retries");
      },
    },
  };
}

/** What the invite email says. */
export interface InviteEmailValues {
  firstName: string;
  /** The inviter's name; null when their account has none, as the owner's may not. */
  inviterName: string | null;
  companyName: string;
  note: string | null;
  link: string;
  expiresAt: Date;
}

export const INVITE_TEMPLATE: EmailTemplate<InviteEmailValues> = {
  name: "invite",
  render: ({ firstName, inviterName, companyName, note, link, expiresAt }) => {
    const subject = inviterName
      ? `${inviterName} invited you to ${companyName} on Broccoli`
      : `You're invited to ${companyName} on Broccoli`;
    const greeting = `Hi ${firstName}, ${inviterName ? `${inviterName} invited you` : "you're invited"} to ${companyName} on Broccoli.`;
    const join = `Join ${companyName}`;
    const expiry = `The link works once, until ${formatDay(expiresAt)}.`;
    const questions = inviterName && `Questions? Ask ${inviterName} directly.`;
    return {
      subject,
      text: [greeting, note && `"${note}"`, `${join}: ${link}`, expiry, questions]
        .filter((part) => part)
        .join("\n\n"),
      html: [
        `<p>${escapeHtml(greeting)}</p>`,
        note && `<blockquote>${escapeHtml(note)}</blockquote>`,
        `<p><a href="${escapeHtml(link)}">${escapeHtml(join)}</a></p>`,
        `<p>${escapeHtml(expiry)}</p>`,
        questions && `<p>${escapeHtml(questions)}</p>`,
      ]
        .filter((part) => part)
        .join("\n"),
    };
  },
};

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}
