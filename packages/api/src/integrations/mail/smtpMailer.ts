import { createTransport } from "nodemailer";

import { MailRefusedError } from "./mailRefusedError";
import type { OutgoingMail } from "./mailer";

/** Connects and signs in to the SMTP server at `url` without sending anything. */
export async function verifySmtpServer(url: string): Promise<void> {
  const transport = smtpTransport(url);
  try {
    if (!(await transport.verify())) {
      throw new MailRefusedError("The SMTP server could not be checked", false);
    }
  } catch (error) {
    throw smtpRefusal(error);
  } finally {
    transport.close();
  }
}

/** Sends through the SMTP server at `url`, one connection per email. */
export function createSmtpMailer({ url }: { url: string }) {
  return async (mail: OutgoingMail): Promise<{ messageId: string | null }> => {
    const transport = smtpTransport(url);
    try {
      const info = await transport.sendMail({
        from: { name: mail.fromName, address: mail.from },
        to: mail.to,
        replyTo: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      return { messageId: info.messageId || null };
    } catch (error) {
      throw smtpRefusal(error);
    } finally {
      transport.close();
    }
  };
}

const CONNECTION_TIMEOUT_MS = 15_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

/** Failures a later try may get past: the network, timeouts, and the server's 4xx replies. */
const RETRYABLE_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS"]);

function smtpTransport(url: string) {
  // Only the connection is taken from the URL: nodemailer would read other options from its
  // query, such as one that runs a local program instead.
  const { protocol, hostname, port, username, password } = new URL(url);
  return createTransport({
    host: hostname,
    port: port === "" ? undefined : Number(port),
    secure: protocol === "smtps:",
    auth: username
      ? { user: decodeURIComponent(username), pass: decodeURIComponent(password) }
      : undefined,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
}

function smtpRefusal(error: unknown): MailRefusedError {
  const { code, responseCode, response, message } = error as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const retryable =
    RETRYABLE_CODES.has(code ?? "") ||
    (responseCode !== undefined && responseCode >= 400 && responseCode < 500);
  return new MailRefusedError(
    `The SMTP server refused (${code ?? "unknown"}${responseCode ? ` ${responseCode}` : ""})`,
    retryable,
    response ?? message ?? null,
  );
}
