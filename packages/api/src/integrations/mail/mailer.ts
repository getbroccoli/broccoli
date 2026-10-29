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
  /** The subject, plain text and HTML; build the HTML with `emailLayout`, which escapes values. */
  render(values: Values): RenderedEmail;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

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
      deliver({ ...envelope, ...template.render(values), from: transport.from }),
  };
}

/** A rendered email ready for a provider. */
export interface OutgoingMail extends RenderedEmail {
  from: string;
  fromName: string;
  to: string;
  idempotencyKey: string;
}
