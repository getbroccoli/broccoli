import {
  aiSettings,
  expect,
  MANAGED_ASSIGNMENT,
  MANAGED_INSTANCE_CREDENTIAL,
  OWNER,
  SYSTEM,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

import { assignInstance } from "./managed";

test("routes OpenRouter with the saved key", async ({ orm, seed, fakeDecisions }) => {
  await seed.aiSource("openrouter", "saved-key");
  const settings = aiSettings(orm, { url: fakeDecisions.url, environmentKey: "environment-key" });
  fakeDecisions.answer({ action: "continue" });

  expect(await settings.decisions.decide({}, QUESTIONS)).toEqual({
    action: { choice: "continue", confidence: 0.95 },
  });
  expect(fakeDecisions.httpRequests()).toMatchObject([
    { path: "/alpha/decisions", headers: { authorization: "Bearer saved-key" } },
  ]);
});

test("routes Broccoli AI with a token", async ({ orm, seed, fakeDecisions }) => {
  await seed.aiSource("broccoli_ai");
  const settings = aiSettings(orm, { url: fakeDecisions.url, environmentKey: "environment-key" });
  fakeDecisions.answer({ action: "continue" });

  expect(await settings.decisions.decide({}, QUESTIONS)).toEqual({
    action: { choice: "continue", confidence: 0.95 },
  });
  expect(fakeDecisions.issuedTokens()).toHaveLength(1);
  expect(fakeDecisions.httpRequests()).toMatchObject([
    { path: "/v1/tokens" },
    {
      path: "/v1/decisions",
      headers: { authorization: `Bearer ${fakeDecisions.issuedTokens()[0]}` },
    },
  ]);
});

test("refuses self-hosted OpenRouter decisions without a key", async ({
  orm,
  seed,
  fakeDecisions,
}) => {
  await seed.aiSource("openrouter");
  const settings = aiSettings(orm, { url: fakeDecisions.url });

  await expect(settings.decisions.decide({}, QUESTIONS)).rejects.toMatchObject({
    name: "DecisionsError",
    message: "OpenRouter has no key",
  });
  expect(fakeDecisions.httpRequests()).toEqual([]);
});

test("managed decisions use the instance credential despite a saved AI choice and key", async ({
  orm,
  seed,
  transact,
  fakeDecisions,
}) => {
  await seed.aiSource("openrouter", "saved-key");
  await transact((tx) =>
    assignInstance(
      SYSTEM,
      tx,
      MANAGED_ASSIGNMENT,
      TEST_SECRET_BOX.encrypt(MANAGED_INSTANCE_CREDENTIAL),
    ),
  );
  fakeDecisions.acceptInstanceCredential(MANAGED_INSTANCE_CREDENTIAL);
  fakeDecisions.answer({ action: "continue" });
  const settings = aiSettings(orm, { mode: "managed", url: fakeDecisions.url });

  expect(await settings.decisions.decide({}, QUESTIONS)).toEqual({
    action: { choice: "continue", confidence: 0.95 },
  });

  expect(fakeDecisions.httpRequests()).toMatchObject([
    {
      path: "/v1/decisions",
      headers: {
        authorization: `Bearer ${MANAGED_INSTANCE_CREDENTIAL}`,
      },
    },
  ]);
  expect(fakeDecisions.httpRequests()[0]!.headers["x-broccoli-client"]).toMatch(/^broccoli\//);
  expect(fakeDecisions.issuedTokens()).toEqual([]);
});

test("managed decisions fail before assignment without contacting the relay", async ({
  orm,
  fakeDecisions,
}) => {
  const settings = aiSettings(orm, { mode: "managed", url: fakeDecisions.url });

  await expect(settings.decisions.decide({}, QUESTIONS)).rejects.toMatchObject({
    name: "DecisionsError",
    retryable: false,
  });

  expect(fakeDecisions.httpRequests()).toEqual([]);
});

test("managed original file reads use the instance credential", async ({
  orm,
  transact,
  fakeDecisions,
}) => {
  await transact((tx) =>
    assignInstance(
      SYSTEM,
      tx,
      MANAGED_ASSIGNMENT,
      TEST_SECRET_BOX.encrypt(MANAGED_INSTANCE_CREDENTIAL),
    ),
  );
  fakeDecisions.acceptInstanceCredential(MANAGED_INSTANCE_CREDENTIAL);
  const settings = aiSettings(orm, { mode: "managed", url: fakeDecisions.url });

  expect(await settings.originalFileReader.readOriginalFile(null, FILE_READ)).toEqual({
    people: [],
  });

  expect(fakeDecisions.httpRequests()).toMatchObject([
    {
      path: "/v1/chat/completions",
      headers: {
        authorization: `Bearer ${MANAGED_INSTANCE_CREDENTIAL}`,
      },
    },
  ]);
  expect(fakeDecisions.httpRequests()[0]!.headers["x-broccoli-client"]).toMatch(/^broccoli\//);
  expect(fakeDecisions.issuedTokens()).toEqual([]);
});

test("managed original file reads fail before assignment without contacting the relay", async ({
  orm,
  fakeDecisions,
}) => {
  const settings = aiSettings(orm, { mode: "managed", url: fakeDecisions.url });

  await expect(settings.originalFileReader.readOriginalFile(null, FILE_READ)).rejects.toMatchObject(
    {
      name: "DecisionsError",
      retryable: false,
    },
  );

  expect(fakeDecisions.httpRequests()).toEqual([]);
});

test("decisions use a changed source on the next request", async ({ orm, seed, fakeDecisions }) => {
  await seed.aiSource("openrouter", "saved-key");
  const settings = aiSettings(orm, { url: fakeDecisions.url });
  await settings.decisions.decide({}, QUESTIONS);

  await settings.save(OWNER, { source: "broccoli_ai" });
  await settings.decisions.decide({}, QUESTIONS);

  expect(
    fakeDecisions.httpRequests().filter(({ path }) => path.endsWith("/decisions")),
  ).toMatchObject([
    { path: "/alpha/decisions", headers: { authorization: "Bearer saved-key" } },
    {
      path: "/v1/decisions",
      headers: { authorization: `Bearer ${fakeDecisions.issuedTokens()[0]}` },
    },
  ]);
});

const QUESTIONS = {
  action: { instructions: "Choose an action.", options: { continue: "Continue", none: "None" } },
};

const FILE_READ = {
  instructions: "Read the people.",
  file: { mimeType: "text/csv" as const, text: "Full name\nAvery Stone" },
  schema: { type: "object" },
};
