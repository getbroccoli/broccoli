import { z } from "zod";

import { readText, urlUnder } from "../../utils";
import { MailRefusedError } from "./mailRefusedError";
import type { OutgoingMail } from "./mailer";

/** Sends through Resend's API at `apiUrl` with the owner's key. */
export function createResendMailer({ apiUrl, key }: { apiUrl: string; key: string }) {
  return async (mail: OutgoingMail): Promise<{ messageId: string | null }> => {
    let response: Response;
    try {
      response = await fetch(urlUnder(apiUrl, "emails"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "idempotency-key": mail.idempotencyKey,
        },
        body: JSON.stringify({
          from: `"${mail.fromName.replaceAll('"', "")}" <${mail.from}>`,
          to: [mail.to],
          reply_to: mail.replyTo,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new MailRefusedError("Resend could not be reached", true, String(error));
    }
    const body = await readText(response, MAX_ANSWER_BYTES).catch(() => "");
    if (!response.ok) {
      throw new MailRefusedError(
        `Resend answered ${response.status}`,
        response.status === 429 || response.status >= 500,
        resendErrorSchema.safeParse(parseJson(body)).data?.message ?? null,
      );
    }
    return { messageId: sentSchema.safeParse(parseJson(body)).data?.id ?? null };
  };
}

const TIMEOUT_MS = 15_000;
const MAX_ANSWER_BYTES = 64 * 1024;

const sentSchema = z.object({ id: z.string() });
const resendErrorSchema = z.object({ message: z.string() });

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
