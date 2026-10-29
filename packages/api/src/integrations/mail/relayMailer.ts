import { z } from "zod";

import { readText, urlUnder } from "../../utils";
import { MailRefusedError } from "./mailRefusedError";
import type { Mailer } from "./mailer";
import { parseJson } from "./parseJson";

/**
 * Sends through Broccoli's mail relay with a managed instance's credential. The relay sends as
 * "<fromName> via Broccoli" and refuses links outside the instance's own origin. Not `fetchJson`
 * (RULE22 exception): it drops a refusal's status and body, which decide whether to retry.
 */
export function createRelayMailer({
  url,
  credential,
}: {
  url: string;
  credential: string;
}): Mailer {
  return {
    send: async ({ template, values, to, fromName, idempotencyKey }) => {
      const { subject, text, html } = template.render(values);
      let response: Response;
      try {
        response = await fetch(urlUnder(url, "v1/send"), {
          method: "POST",
          headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
          body: JSON.stringify({
            to,
            fromName: fitHeader(fromName, MAX_FROM_NAME_LENGTH),
            subject: fitHeader(subject, MAX_SUBJECT_LENGTH),
            text,
            html,
            idempotencyKey,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new MailRefusedError("The mail relay could not be reached", true, String(error));
      }
      if (!response.ok) {
        const body = await readText(response, MAX_ANSWER_BYTES).catch(() => "");
        // Over quota or busy: a later retry may go through; any other refusal stays refused.
        throw new MailRefusedError(
          `The mail relay answered ${response.status}`,
          response.status === 429 || response.status >= 500,
          relayErrorSchema.safeParse(parseJson(body)).data?.error ?? null,
        );
      }
      return { messageId: await readMessageId(response) };
    },
  };
}

const TIMEOUT_MS = 20_000;
const MAX_ANSWER_BYTES = 64 * 1024;
// The relay's limits on what goes into a header; the email's text keeps the full names.
const MAX_FROM_NAME_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 200;

const sentSchema = z.object({ messageId: z.string() });
const relayErrorSchema = z.object({ error: z.string() });

/** A header value the relay accepts: no quotes, angle brackets or line breaks, cut to `maxLength`. */
function fitHeader(value: string, maxLength: number): string {
  return value
    .replace(/["<>]/g, "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** The relay's message id; an answer without one may hide an unsent email, so it is retried. */
async function readMessageId(response: Response): Promise<string> {
  const body = await readText(response, MAX_ANSWER_BYTES).catch(() => null);
  const sent = body === null ? null : sentSchema.safeParse(parseJson(body)).data;
  if (!sent) {
    throw new MailRefusedError("The mail relay's answer could not be read", true);
  }
  return sent.messageId;
}
