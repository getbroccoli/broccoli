import { aiSettings, expect, OWNER, test } from "#test/support";

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

test("managed decisions use the environment key despite a saved Broccoli AI choice and key", async ({
  orm,
  seed,
  fakeDecisions,
}) => {
  await seed.aiSource("broccoli_ai", "saved-key");
  const settings = aiSettings(orm, {
    mode: "managed",
    url: fakeDecisions.url,
    environmentKey: "environment-key",
  });

  await settings.decisions.decide({}, QUESTIONS);

  expect(fakeDecisions.httpRequests()).toMatchObject([
    { path: "/alpha/decisions", headers: { authorization: "Bearer environment-key" } },
  ]);
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
