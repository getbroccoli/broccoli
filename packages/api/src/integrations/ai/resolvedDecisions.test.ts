import { expect, it, onTestFinished } from "vitest";

import { startFakeDecisions } from "#test/support";

import { createResolvedDecisions, DecisionsError } from ".";

it("keeps an issued token when its first save fails", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  const tokens = tokenStore();
  let failSave = true;
  const decisions = createResolvedDecisions({
    readSource: () => Promise.resolve({ kind: "broccoli_ai", url: relay.url }),
    tokens: {
      read: tokens.read,
      save: (token) => {
        if (failSave) {
          failSave = false;
          return Promise.reject(new Error("Token save failed"));
        }
        return tokens.save(token);
      },
    },
  });
  await expect(decisions.decide({}, QUESTIONS)).rejects.toThrow("Token save failed");

  const answer = await decisions.decide({}, QUESTIONS);

  expect(answer).toEqual(ANSWER);
  expect(relay.issuedTokens()).toHaveLength(1);
  expect(await tokens.read()).toBe(relay.issuedTokens()[0]);
});

it("a late token read reuses the token another request has already saved", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  const tokens = tokenStore();
  const reading = Promise.withResolvers<void>();
  const lateRead = Promise.withResolvers<string | null>();
  let firstRead = true;
  const decisions = createResolvedDecisions({
    readSource: () => Promise.resolve({ kind: "broccoli_ai", url: relay.url }),
    tokens: {
      read: () => {
        if (firstRead) {
          firstRead = false;
          reading.resolve();
          return lateRead.promise;
        }
        return tokens.read();
      },
      save: tokens.save,
    },
  });

  const first = decisions.decide({}, QUESTIONS);
  await reading.promise;
  const second = decisions.decide({}, QUESTIONS);
  lateRead.resolve(null);

  expect(await Promise.all([first, second])).toEqual([ANSWER, ANSWER]);
  expect(relay.issuedTokens()).toHaveLength(1);
});

it("a relay URL with a trailing slash reaches the token and decisions endpoints", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  const decisions = createResolvedDecisions({
    readSource: () => Promise.resolve({ kind: "broccoli_ai", url: `${relay.url}/` }),
    tokens: tokenStore(),
  });

  const answer = await decisions.decide({}, QUESTIONS);

  expect(answer).toEqual(ANSWER);
  expect(relay.httpRequests().map(({ path }) => path)).toEqual(
    expect.arrayContaining(["/v1/tokens", "/v1/decisions"]),
  );
});

it("an oversized refusal drops the provider message and stays non-retryable", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  relay.fail(403, "x".repeat(1024 * 1024));
  const decisions = createResolvedDecisions({
    readSource: () => Promise.resolve({ kind: "broccoli_ai", url: relay.url }),
    tokens: tokenStore(),
  });

  const refusal = decisions.decide({}, QUESTIONS);

  await expect(refusal).rejects.toBeInstanceOf(DecisionsError);
  await expect(refusal).rejects.toMatchObject({ providerMessage: null, retryable: false });
});

const QUESTIONS = {
  fullName: {
    instructions: "Which column contains full names?",
    options: { A: "Column A", none: "None" },
  },
};
const ANSWER = { fullName: { choice: "none", confidence: 0.95 } };

function tokenStore() {
  let stored: string | null = null;
  return {
    read: () => Promise.resolve(stored),
    save: (token: string) => {
      stored = token;
      return Promise.resolve();
    },
  };
}
