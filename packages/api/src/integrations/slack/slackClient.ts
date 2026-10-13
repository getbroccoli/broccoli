import { z } from "zod";

import { fetchJson, urlUnder } from "../../utils";

/** What Slack granted the instance: a bot token for one workspace. */
export interface SlackGrant {
  accessToken: string;
  scopes: string[];
  team: { id: string; name: string };
}

/** A member of a Slack workspace, as `users.list` returns it. */
export type SlackMember = z.infer<typeof member>;

/**
 * Slack, reached through Broccoli's OAuth relay on the accounts service: the relay
 * holds the app's secret and hands the token over once, bound to a PKCE verifier.
 */
export interface SlackClient {
  /** Where the browser starts connecting Slack. */
  authorizeUrl(params: { returnTo: string; state: string; codeChallenge: string }): URL;
  /** Exchanges the relay's one-time handle for the grant; rejects when the relay refuses. */
  redeem(params: { handle: string; codeVerifier: string }): Promise<SlackGrant>;
  /** Every member of the workspace, page by page; rejects when Slack refuses. */
  listMembers(accessToken: string): Promise<SlackMember[]>;
}

export function createSlackClient({
  relayUrl,
  apiUrl,
}: {
  relayUrl: string;
  apiUrl: string;
}): SlackClient {
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

    redeem: async ({ handle, codeVerifier }) => {
      const answer = await fetchJson(urlUnder(relayUrl, "slack/redeem"), redeemAnswer, {
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_REDEEM_BYTES,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle, code_verifier: codeVerifier }),
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

    listMembers: async (accessToken) => {
      const members: SlackMember[] = [];
      let cursor = "";
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = urlUnder(apiUrl, "users.list");
        url.search = new URLSearchParams({ limit: String(PAGE_SIZE), cursor }).toString();
        const answer = await fetchJson(url, usersListAnswer, {
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_PAGE_BYTES,
          init: { headers: { authorization: `Bearer ${accessToken}` } },
        });
        if (!answer?.ok) {
          throw new Error(`Slack refused users.list: ${answer?.error ?? "not found"}`);
        }
        members.push(...answer.members);
        cursor = answer.response_metadata?.next_cursor ?? "";
        if (cursor === "") {
          return members;
        }
      }
      throw new Error(`The workspace has more than ${MAX_PAGES * PAGE_SIZE} members`);
    },
  };
}

const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const MAX_REDEEM_BYTES = 16 * 1024;
/** A page of 200 full Slack profiles stays well below this. */
const MAX_PAGE_BYTES = 8 * 1024 * 1024;

const redeemAnswer = z.object({
  ok: z.literal(true),
  access_token: z.string().min(1),
  scope: z.string(),
  team: z.object({ id: z.string(), name: z.string() }),
});

const member = z.object({
  id: z.string(),
  name: z.string().optional(),
  real_name: z.string().optional(),
  deleted: z.boolean().optional(),
  is_bot: z.boolean().optional(),
  is_app_user: z.boolean().optional(),
  is_restricted: z.boolean().optional(),
  is_ultra_restricted: z.boolean().optional(),
  profile: z
    .object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      real_name: z.string().optional(),
      display_name: z.string().optional(),
      email: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

const usersListAnswer = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  members: z.array(member).default([]),
  response_metadata: z.object({ next_cursor: z.string().optional() }).optional(),
});
