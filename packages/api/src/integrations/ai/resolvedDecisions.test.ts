import { expect, it, onTestFinished } from "vitest";

import { MANAGED_INSTANCE_CREDENTIAL, startFakeDecisions } from "#test/support";

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

it("serializes token reads across concurrent decisions", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  const tokens = tokenStore();
  const reading = Promise.withResolvers<void>();
  const releaseRead = Promise.withResolvers<void>();
  let readsInFlight = 0;
  let maxReadsInFlight = 0;
  const decisions = createResolvedDecisions({
    readSource: () => Promise.resolve({ kind: "broccoli_ai", url: relay.url }),
    tokens: {
      read: async () => {
        readsInFlight += 1;
        maxReadsInFlight = Math.max(maxReadsInFlight, readsInFlight);
        reading.resolve();
        await releaseRead.promise;
        const token = await tokens.read();
        readsInFlight -= 1;
        return token;
      },
      save: tokens.save,
    },
  });

  const first = decisions.decide({}, QUESTIONS);
  await reading.promise;
  const second = decisions.decide({}, QUESTIONS);
  // Let the second request read its source while the first token read is held.
  await Promise.resolve();
  releaseRead.resolve();

  expect(await Promise.all([first, second])).toEqual([ANSWER, ANSWER]);
  expect(maxReadsInFlight).toBe(1);
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

it("sends the instance credential to the relay without issuing a token", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  relay.acceptInstanceCredential(MANAGED_INSTANCE_CREDENTIAL);
  const decisions = createResolvedDecisions({
    readSource: () =>
      Promise.resolve({
        kind: "broccoli_ai_instance",
        url: relay.url,
        credential: MANAGED_INSTANCE_CREDENTIAL,
      }),
    tokens: tokenStore(),
  });

  expect(await decisions.decide({}, QUESTIONS)).toEqual(ANSWER);

  expect(relay.httpRequests()).toMatchObject([
    {
      path: "/v1/decisions",
      headers: {
        authorization: `Bearer ${MANAGED_INSTANCE_CREDENTIAL}`,
      },
    },
  ]);
  expect(relay.httpRequests()[0]!.headers["x-broccoli-client"]).toMatch(/^broccoli\//);
  expect(relay.issuedTokens()).toEqual([]);
});

it("does not retry an instance credential refused with 401", async () => {
  const relay = await startFakeDecisions();
  onTestFinished(() => relay.stop());
  const decisions = createResolvedDecisions({
    readSource: () =>
      Promise.resolve({
        kind: "broccoli_ai_instance",
        url: relay.url,
        credential: MANAGED_INSTANCE_CREDENTIAL,
      }),
    tokens: tokenStore(),
  });

  const refusal = decisions.decide({}, QUESTIONS);

  await expect(refusal).rejects.toBeInstanceOf(DecisionsError);
  await expect(refusal).rejects.toMatchObject({ retryable: false });
  expect(relay.httpRequests()).toMatchObject([
    { path: "/v1/decisions", headers: { authorization: `Bearer ${MANAGED_INSTANCE_CREDENTIAL}` } },
  ]);
  expect(relay.httpRequests()[0]!.headers["x-broccoli-client"]).toMatch(/^broccoli\//);
  expect(relay.issuedTokens()).toEqual([]);
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
