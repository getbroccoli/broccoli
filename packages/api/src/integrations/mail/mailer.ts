import { renderTemplate } from "./templates";
import { createResendMailer } from "./resendMailer";
import { createSmtpMailer } from "./smtpMailer";

/** Sends one of Broccoli's emails, rendered from its template. */
export interface Mailer {
  /** Throws `MailRefusedError` when the provider refused or could not be reached. */
  send(message: MailMessage): Promise<{ messageId: string | null }>;
}

/** One email: the template and its values, and who it goes to and comes from. */
export type MailMessage = {
  to: string;
  replyTo?: string;
  /** The sender's display name, used as it is. */
  fromName: string;
  /** Makes a retried send of the same email a no-op where the provider supports it. */
  idempotencyKey: string;
} & TemplateValues;

/** Each template with the values it fills in. */
export type TemplateValues =
  | { template: "password_reset"; values: { resetLink: string } }
  | { template: "test_email"; values: Record<string, never> };

/** Where a self-hosted instance sends its email: the owner's SMTP server or their Resend key. */
export type MailTransport =
  | { kind: "smtp_server"; url: string; from: string }
  | { kind: "resend_api"; apiUrl: string; key: string; from: string };

/** A mailer for `transport`, built per send so a changed choice applies at once. */
export function createMailer(transport: MailTransport): Mailer {
  const deliver =
    transport.kind === "smtp_server" ? createSmtpMailer(transport) : createResendMailer(transport);
  return {
    send: ({ template, values, ...envelope }) =>
      deliver({
        ...envelope,
        ...renderTemplate({ template, values } as TemplateValues),
        from: transport.from,
      }),
  };
}

/** A rendered email ready for a provider. */
export interface OutgoingMail {
  from: string;
  fromName: string;
  to: string;
  replyTo?: string;
  idempotencyKey: string;
  subject: string;
  text: string;
  html: string;
}
