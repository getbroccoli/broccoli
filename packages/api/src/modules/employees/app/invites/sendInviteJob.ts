import type { Orm } from "../../../../core/db";
import type { JobHandlers } from "../../../../core/jobs";
import type { InstanceMailer } from "../../../../core/instance";
import type { Logger } from "../../../../core/logger";
import type { SecretBox } from "../../../../core/secrets";
import { MailRefusedError } from "../../../../integrations/mail";
import { employeeRepository, inviteRepository } from "../../db";
import { inviteLink, isOpen } from "../../domain";
import { INVITE_TEMPLATE } from "./invite.email";

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
  readMailer: () => Promise<InstanceMailer | null>;
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
            fromName: senderName(inviter?.name ?? null, companyName, saved.sendsThroughBroccoli),
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

/** The invite comes from the inviter; Broccoli's relay adds "via Broccoli" itself. */
function senderName(inviterName: string | null, companyName: string, viaBroccoli: boolean) {
  if (!inviterName) return companyName;
  return viaBroccoli ? inviterName : `${inviterName} via ${companyName}`;
}
