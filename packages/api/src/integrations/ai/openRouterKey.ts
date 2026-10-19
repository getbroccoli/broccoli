import { urlUnder } from "../../utils";

import { DecisionsError, refusal } from "./decisions";

const CHECK_TIMEOUT_MS = 15_000;

/**
 * Asks OpenRouter (`url`, such as `https://openrouter.ai/api`) whether `key` works. Throws a
 * `DecisionsError` when it does not: not retryable when OpenRouter refuses the key.
 */
export async function checkOpenRouterKey({
  url,
  key,
}: {
  url: string;
  key: string;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(urlUnder(url, "v1/key").href, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    throw new DecisionsError(`OpenRouter could not be reached: ${String(error)}`, true);
  }
  if (!response.ok) {
    throw await refusal(response);
  }
  await response.body?.cancel();
}
