import { z } from "zod";

import { readText, urlUnder } from "../../utils";
import { MailRefusedError } from "./mailRefusedError";
import type { Mailer } from "./mailer";
import { parseJson } from "./parseJson";

/**
 * Sends through Broccoli's mail relay with a managed instance's credential. The relay sends as
 * "<fromName> via Broccoli" and refuses links outside the instance's own origin.
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
      const rendered = template.render(values);
      let response: Response;
      try {
        response = await fetch(urlUnder(url, "v1/send"), {
          method: "POST",
          headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
          body: JSON.stringify({ to, fromName, ...rendered, idempotencyKey }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new MailRefusedError("The mail relay could not be reached", true, String(error));
      }
      const body = await readText(response, MAX_ANSWER_BYTES).catch(() => "");
      if (!response.ok) {
        // Over quota or busy: a later retry may go through; any other refusal stays refused.
        throw new MailRefusedError(
          `The mail relay answered ${response.status}`,
          response.status === 429 || response.status >= 500,
          relayErrorSchema.safeParse(parseJson(body)).data?.error ?? null,
        );
      }
      return { messageId: sentSchema.safeParse(parseJson(body)).data?.messageId ?? null };
    },
  };
}

const TIMEOUT_MS = 20_000;
const MAX_ANSWER_BYTES = 64 * 1024;

const sentSchema = z.object({ messageId: z.string() });
const relayErrorSchema = z.object({ error: z.string() });
