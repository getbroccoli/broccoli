import { z } from "zod";

import {
  createDecisions,
  type Decisions,
  DecisionsError,
  parseJson,
  postJson,
  readBody,
  refusal,
  UnauthorizedDecisionsError,
} from "./decisions";

/** Where the install keeps its Broccoli AI token; null until the first one is issued. */
export interface BroccoliAiTokenStore {
  read(): Promise<string | null>;
  save(token: string): Promise<void>;
}

/** Where AI decisions go: OpenRouter with the install's key, or Broccoli AI without one. */
export type DecisionsSource =
  { kind: "openrouter"; url: string; key: string } | { kind: "broccoli_ai"; url: string };

/**
 * Decisions that pick their source on every request through `readSource`, so a source the
 * owner chooses later applies at once. Broccoli AI gets a token on first use and a new one
 * once when the relay no longer knows it.
 */
export function createResolvedDecisions({
  readSource,
  tokens,
}: {
  readSource: () => Promise<DecisionsSource>;
  tokens: BroccoliAiTokenStore;
}): Decisions {
  const broccoliAi = broccoliAiTokens(tokens);
  return {
    decide: async (state, questions, minConfidence) => {
      const source = await readSource();
      if (source.kind === "openrouter") {
        return createDecisions({
          endpoint: `${source.url}/alpha/decisions`,
          credential: source.key,
        }).decide(state, questions, minConfidence);
      }
      const decideWith = (token: string) =>
        createDecisions({
          endpoint: `${source.url}/v1/decisions`,
          credential: token,
          headers: CLIENT_HEADERS,
        }).decide(state, questions, minConfidence);
      const token = await broccoliAi.current(source.url);
      try {
        return await decideWith(token);
      } catch (error) {
        if (!(error instanceof UnauthorizedDecisionsError)) {
          throw error;
        }
        return decideWith(await broccoliAi.replace(source.url, token));
      }
    },
  };
}

/** Lets the relay tell Broccoli from scanners; not a secret. */
// shortcut: Broccoli has no release version yet; send it here once releases carry one.
const CLIENT_HEADERS = { "x-broccoli-client": "broccoli/0.0.0" };

const ISSUE_TIMEOUT_MS = 30_000;

const issuedTokenSchema = z.object({ token: z.string().min(1) });

/**
 * The stored token, issued when missing. Concurrent callers share one issue, since the relay
 * gives an address only one free token.
 */
function broccoliAiTokens(store: BroccoliAiTokenStore) {
  let issuing: Promise<string> | null = null;
  const issueOnce = (url: string): Promise<string> => {
    issuing ??= issueToken(url)
      .then(async (token) => {
        await store.save(token);
        return token;
      })
      .finally(() => {
        issuing = null;
      });
    return issuing;
  };
  return {
    current: async (url: string) => (await store.read()) ?? issueOnce(url),
    /** A new token unless another request already replaced `rejected`. */
    replace: async (url: string, rejected: string) => {
      const stored = await store.read();
      return stored !== null && stored !== rejected ? stored : issueOnce(url);
    },
  };
}

async function issueToken(url: string): Promise<string> {
  const response = await postJson(`${url}/v1/tokens`, CLIENT_HEADERS, ISSUE_TIMEOUT_MS);
  if (!response.ok) {
    throw await refusal(response);
  }
  const parsed = issuedTokenSchema.safeParse(parseJson(await readBody(response)));
  if (!parsed.success) {
    throw new DecisionsError("Broccoli AI issued an unreadable token", false);
  }
  return parsed.data.token;
}
