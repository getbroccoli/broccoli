import { type EmailContent, renderEmail } from "./renderEmail";
import { createResendMailer } from "./resendMailer";
import { createSmtpMailer } from "./smtpMailer";

/** Sends one of Broccoli's emails, rendered from its template. */
export interface Mailer {
  /** Throws `MailRefusedError` when the provider refused or could not be reached. */
  send<Values>(message: MailMessage<Values>): Promise<{ messageId: string | null }>;
}

/** One email: its template and values, and who it goes to and comes from. */
export interface MailMessage<Values> {
  template: EmailTemplate<Values>;
  values: Values;
  to: string;
  /** The sender's display name, used as it is. */
  fromName: string;
  /** Makes a retried send of the same email a no-op where the provider supports it. */
  idempotencyKey: string;
}

/** One of Broccoli's emails; the code that sends it owns its copy. */
export interface EmailTemplate<Values> {
  /** Names the email, such as `password_reset`. */
  name: string;
  /** What the email says, as blocks of plain text and links. */
  render(values: Values): EmailContent;
}

/** Where a self-hosted instance sends its email: the owner's SMTP server or their Resend key. */
export type MailTransport =
  | { kind: "smtp_server"; url: string; from: string }
  | { kind: "resend_api"; apiUrl: string; key: string; from: string };

/**
 * A mailer for `transport`, rendering each email with the mark served by `origin`; built per send
 * so a changed choice applies at once.
 */
export function createMailer(transport: MailTransport, origin: string): Mailer {
  const deliver =
    transport.kind === "smtp_server" ? createSmtpMailer(transport) : createResendMailer(transport);
  return {
    send: ({ template, values, ...envelope }) => {
      const content = template.render(values);
      return deliver({
        ...envelope,
        ...renderEmail(content, origin),
        subject: content.subject,
        from: transport.from,
      });
    },
  };
}

/** A rendered email ready for a provider. */
export interface OutgoingMail {
  subject: string;
  text: string;
  html: string;
  from: string;
  fromName: string;
  to: string;
  idempotencyKey: string;
}
