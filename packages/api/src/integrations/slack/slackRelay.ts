import { z } from "zod";

import { fetchJson, urlUnder } from "../../utils";

/** What Slack granted the instance: a bot token for one workspace. */
export interface SlackGrant {
  accessToken: string;
  scopes: string[];
  team: { id: string; name: string };
}

/** How the instance gets a Slack token: the browser goes to Slack, then a one-time code comes back. */
export interface SlackAuthorization {
  /** Where the browser starts connecting Slack. */
  authorizeUrl(params: { returnTo: string; state: string; codeChallenge: string }): URL;
  /** Exchanges the one-time code from the return for the grant; rejects when refused. */
  exchange(params: { code: string; codeVerifier: string }): Promise<SlackGrant>;
}

/**
 * Slack authorization through Broccoli's OAuth relay on the accounts service: the relay
 * holds the app's secret and hands the token over once, for a handle bound to a PKCE verifier.
 */
export function createSlackRelay(relayUrl: string): SlackAuthorization {
  return {
    authorizeUrl: ({ returnTo, state, codeChallenge }) => {
      const url = urlUnder(relayUrl, "slack/authorize");
      url.search = new URLSearchParams({
        return_to: returnTo,
        state,
        code_challenge: codeChallenge,
      }).toString();
      return url;
    },

    exchange: async ({ code, codeVerifier }) => {
      const answer = await fetchJson(urlUnder(relayUrl, "slack/redeem"), redeemAnswer, {
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_REDEEM_BYTES,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle: code, code_verifier: codeVerifier }),
        },
      });
      if (!answer) {
        throw new Error("The Slack relay does not know this handle");
      }
      return {
        accessToken: answer.access_token,
        scopes: answer.scope.split(","),
        team: answer.team,
      };
    },
  };
}

const TIMEOUT_MS = 15_000;
const MAX_REDEEM_BYTES = 16 * 1024;

const redeemAnswer = z.object({
  ok: z.literal(true),
  access_token: z.string().min(1),
  scope: z.string(),
  team: z.object({ id: z.string(), name: z.string() }),
});
