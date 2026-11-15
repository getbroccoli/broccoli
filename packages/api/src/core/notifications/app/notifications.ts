import { z } from "zod";

import type { InstanceMailer } from "../../instance";
import type { JobHandlers, JobQueue, Jobs } from "../../jobs";
import type { Logger } from "../../logger";
import type { ProcessActionRegistration, ProcessActionRegistrations } from "../../processes";
import type { RecordTypeRegistry } from "../../records";
import { type EmailTemplate, MailRefusedError, senderName } from "../../../integrations/mail";
import type { NotificationPeoplePort } from "../ports";
import type { NotifyParams } from "./registrations";

/** What every notification email gets besides its own values. */
export interface NotificationEmailContext {
  recipientEmail: string;
  linkOrigin: string;
  companyName: string;
}

/** An email a module registers for its records, by key, such as "tasks.task_assigned". */
export interface NotificationEmailTemplateRegistration<Values> {
  template: EmailTemplate<Values & NotificationEmailContext>;
  /**
   * The record as it is now for this recipient, and who the email comes from; null drops it, when
   * the record is gone or the recipient may no longer see it.
   */
  readValues(
    recordId: string,
    recipientEmployeeId: string,
  ): Promise<{ values: Values; senderName: string | null } | null>;
}

export type NotificationEmailTemplateRegistrations = Readonly<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each key has its own values.
  Record<string, NotificationEmailTemplateRegistration<any>>
>;

export interface NotificationsDependencies {
  jobs: JobQueue;
  logger: Logger;
  /** The registered record types; a notify step reads its recipient from the run's record. */
  recordTypes: RecordTypeRegistry;
  emailTemplates: NotificationEmailTemplateRegistrations;
  people: NotificationPeoplePort;
  readMailer: () => Promise<InstanceMailer | null>;
  readCompanyName: () => Promise<string>;
}

/** Notifications: the `notifications.notify` action process steps run, and the job that emails. */
export interface Notifications {
  actions: ProcessActionRegistrations;
  jobs: JobHandlers;
}

/**
 * A notify step says who to tell and with which email; the send job is the only place that knows
 * about email, so another channel later changes no process.
 */
export function createNotifications(dependencies: NotificationsDependencies): Notifications {
  return {
    actions: { "notifications.notify": notifyAction(dependencies) },
    jobs: { "notifications.send": sendJob(dependencies) },
  };
}

function notifyAction({
  jobs,
  recordTypes,
  emailTemplates,
}: NotificationsDependencies): ProcessActionRegistration<NotifyParams> {
  const employeeFields = Object.values(recordTypes).flatMap(
    (registration) => registration?.processes?.employeeFields ?? [],
  );
  return {
    params: z.object({
      recipient: z.object({ kind: z.literal("record_employee"), field: oneOf(employeeFields) }),
      emailTemplateKey: oneOf(Object.keys(emailTemplates)),
    }),
    async run(_ctx, tx, { run, step, params }) {
      const capabilities = recordTypes[run.recordType as keyof RecordTypeRegistry]?.processes;
      if (
        !capabilities?.readEmployees ||
        !capabilities.employeeFields?.includes(params.recipient.field)
      ) {
        throw new Error(`A ${run.recordType} has no employee field ${params.recipient.field}`);
      }
      const employees = await capabilities.readEmployees(tx, run.recordId);
      const recipientId = employees?.[params.recipient.field] ?? null;
      const byEmployeeId = (
        run.triggerEvent?.payload as { byEmployeeId?: string | null } | undefined
      )?.byEmployeeId;
      const outcome = !recipientId
        ? "no_recipient_for_step"
        : recipientId === byEmployeeId
          ? "recipient_made_the_change"
          : "queued";
      if (outcome === "queued") {
        await jobs.send(tx, "notifications.send", {
          recipient: { employeeId: recipientId! },
          emailTemplateKey: params.emailTemplateKey,
          record: { recordType: run.recordType, recordId: run.recordId },
          key: `${run.id}:${step.key}`,
        });
      }
      tx.publish("notifications.notify_decided", {
        runId: run.id,
        stepKey: step.key,
        emailTemplateKey: params.emailTemplateKey,
        outcome,
      });
    },
  };
}

function sendJob({
  logger,
  emailTemplates,
  people,
  readMailer,
  readCompanyName,
}: NotificationsDependencies): NonNullable<JobHandlers["notifications.send"]> {
  return {
    async run(payload) {
      const { key, emailTemplateKey, recipient, record } = payload;
      const log = { key, emailTemplateKey, recordId: record.recordId };
      // Each key has its own values; the template and its reader agree on them.
      const registration: NotificationEmailTemplateRegistration<object> | undefined =
        emailTemplates[emailTemplateKey];
      if (!registration) throw new Error(`No email template ${emailTemplateKey}`);
      const person = await people.readRecipient(recipient.employeeId);
      if (!person?.joined) {
        logger.info(
          { ...log, why: person ? "not_joined" : "recipient_gone" },
          "Notification dropped",
        );
        return;
      }
      const read = await registration.readValues(record.recordId, recipient.employeeId);
      if (!read) {
        logger.info({ ...log, why: "record_gone_or_hidden" }, "Notification dropped");
        return;
      }
      const saved = await readMailer();
      if (!saved) {
        logger.warn({ ...log, why: "no_email_chosen" }, "Notification dropped");
        return;
      }
      const companyName = await readCompanyName();
      try {
        const { messageId } = await saved.mailer.send({
          template: registration.template,
          values: {
            ...read.values,
            recipientEmail: person.email,
            linkOrigin: saved.linkOrigin,
            companyName,
          },
          to: person.email,
          fromName: senderName(read.senderName, companyName, saved.sendsThroughBroccoli),
          idempotencyKey: key,
        });
        logger.info({ ...log, messageId }, "Notification sent");
      } catch (error) {
        if (!(error instanceof MailRefusedError) || error.retryable) throw error;
        logger.warn({ ...log, kind: error.message }, "Notification refused");
      }
    },
    onFailed: ({ key, emailTemplateKey, record }: Jobs["notifications.send"]) =>
      Promise.resolve(
        logger.error(
          { key, emailTemplateKey, recordId: record.recordId },
          "Notification failed after retries",
        ),
      ),
  };
}

/** A string among `values`; none registered refuses every value. */
function oneOf(values: readonly string[]) {
  return z.string().refine((value) => values.includes(value), { message: "Not registered" });
}
