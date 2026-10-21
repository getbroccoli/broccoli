import { z } from "zod";

import { urlUnder } from "../../utils";

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
import { createOriginalFileReader, type OriginalFileRead } from "./originalFileRead";

/** Where the install keeps its Broccoli AI token; null until the first one is issued. */
export interface BroccoliAiTokenStore {
  read(): Promise<string | null>;
  save(token: string): Promise<void>;
}

/** Where AI decisions go: OpenRouter with the install's key, or Broccoli AI without one. */
export type DecisionsSource =
  { kind: "openrouter"; url: string; key: string } | { kind: "broccoli_ai"; url: string };

/** Decisions whose source is picked per request, and the Broccoli AI token they use. */
export interface ResolvedDecisions extends Decisions {
  /** Reads a whole file through `source`, the one chosen when the owner allowed it. */
  readOriginalFile(source: DecisionsSource, request: OriginalFileRead): Promise<unknown>;
  /** Makes sure the install holds a Broccoli AI token, issuing one when it has none. */
  prepareBroccoliAi(url: string): Promise<void>;
}

/**
 * Decisions and reads that pick their source on every request through `readSource`, so a source
 * the owner chooses later applies at once. Broccoli AI gets a token on first use and a new one
 * once when the relay no longer knows it.
 */
export function createResolvedDecisions({
  readSource,
  tokens,
}: {
  readSource: () => Promise<DecisionsSource>;
  tokens: BroccoliAiTokenStore;
}): ResolvedDecisions {
  const broccoliAi = broccoliAiTokens(tokens);
  /** Sends one request to the source of the moment, with a new Broccoli AI token once if needed. */
  const askSource = async <T>(
    source: DecisionsSource,
    ask: (connection: SourceConnection) => Promise<T>,
  ): Promise<T> => {
    if (source.kind === "openrouter") {
      return ask({ ...OPENROUTER_PATHS, url: source.url, credential: source.key, headers: {} });
    }
    const askWith = (token: string) =>
      ask({ ...RELAY_PATHS, url: source.url, credential: token, headers: CLIENT_HEADERS });
    const token = await broccoliAi.current(source.url);
    try {
      return await askWith(token);
    } catch (error) {
      if (!(error instanceof UnauthorizedDecisionsError)) {
        throw error;
      }
      return askWith(await broccoliAi.replace(source.url, token));
    }
  };
  return {
    decide: async (state, questions, minConfidence) =>
      askSource(await readSource(), ({ url, decisionsPath, credential, headers }) =>
        createDecisions({
          endpoint: urlUnder(url, decisionsPath).href,
          credential,
          headers,
        }).decide(state, questions, minConfidence),
      ),
    readOriginalFile: (source, request) =>
      askSource(source, ({ url, chatCompletionsPath, credential, headers }) =>
        createOriginalFileReader({
          endpoint: urlUnder(url, chatCompletionsPath).href,
          credential,
          headers,
        }).readOriginalFile(request),
      ),
    prepareBroccoliAi: async (url) => {
      await broccoliAi.current(url);
    },
  };
}

/** Where one request goes, as whom. */
interface SourceConnection {
  url: string;
  decisionsPath: string;
  chatCompletionsPath: string;
  credential: string;
  headers: Record<string, string>;
}

/** The relay speaks OpenRouter's contracts, with decisions under its own path. */
const OPENROUTER_PATHS = {
  decisionsPath: "alpha/decisions",
  chatCompletionsPath: "v1/chat/completions",
};
const RELAY_PATHS = { decisionsPath: "v1/decisions", chatCompletionsPath: "v1/chat/completions" };

/** Lets the relay tell Broccoli from scanners; not a secret. */
// shortcut: Broccoli has no release version yet; send it here once releases carry one.
const CLIENT_HEADERS = { "x-broccoli-client": "broccoli/0.0.0" };

const ISSUE_TIMEOUT_MS = 30_000;

const issuedTokenSchema = z.object({ token: z.string().min(1) });

/**
 * The stored token, issued when missing. One caller at a time reads, issues and saves, and an
 * issued token stays in memory until it is saved, since the relay gives an address only one
 * free token.
 */
function broccoliAiTokens(store: BroccoliAiTokenStore) {
  let unsaved: string | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const tokenOtherThan = async (url: string, rejected: string | null): Promise<string> => {
    if (unsaved !== null) {
      await store.save(unsaved);
      unsaved = null;
    }
    const stored = await store.read();
    if (stored !== null && stored !== rejected) {
      return stored;
    }
    unsaved = await issueToken(url);
    await store.save(unsaved);
    const token = unsaved;
    unsaved = null;
    return token;
  };
  const oneAtATime = (url: string, rejected: string | null): Promise<string> => {
    const next = queue.then(() => tokenOtherThan(url, rejected));
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    current: (url: string) => oneAtATime(url, null),
    /** A new token unless another request already replaced `rejected`. */
    replace: (url: string, rejected: string) => oneAtATime(url, rejected),
  };
}

async function issueToken(url: string): Promise<string> {
  const response = await postJson(
    urlUnder(url, "v1/tokens").href,
    CLIENT_HEADERS,
    ISSUE_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw await refusal(response);
  }
  const parsed = issuedTokenSchema.safeParse(parseJson(await readBody(response)));
  if (!parsed.success) {
    throw new DecisionsError("Broccoli AI issued an unreadable token", false);
  }
  return parsed.data.token;
}
