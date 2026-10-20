import { sql } from "drizzle-orm";
import { onTestFinished } from "vitest";

import {
  aiSettings,
  expect,
  NON_OWNER,
  OWNER,
  SETUP_HOLDER,
  SYSTEM,
  startFakeHttpServer,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

test.for([OWNER, SETUP_HOLDER, SYSTEM])(
  "reads Broccoli AI on a new self-hosted instance with setup access",
  async (ctx, { orm }) => {
    expect(await aiSettings(orm).read(ctx)).toEqual({ source: "broccoli_ai", openRouterKey: null });
  },
);

test("reads the environment key and its origin when no source is chosen", async ({ orm }) => {
  const settings = aiSettings(orm, { environmentKey: "environment-key" });

  expect(await settings.read(OWNER)).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

test("reads the saved source and key before the environment default", async ({ orm, seed }) => {
  await seed.aiSource("broccoli_ai", "saved-key");
  const settings = aiSettings(orm, { environmentKey: "environment-key" });

  expect(await settings.read(OWNER)).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

test("reports no AI choice on a managed instance", async ({ orm, seed }) => {
  await seed.aiSource("broccoli_ai", "saved-key");
  const settings = aiSettings(orm, { mode: "managed", environmentKey: "managed-key" });

  expect(await settings.read(OWNER)).toBeNull();
});

test.for(["self_hosted", "managed"] as const)(
  "refuses a non-owner reading the AI choice in %s mode",
  async (mode, { orm, fakeDecisions }) => {
    const settings = aiSettings(orm, { mode, url: fakeDecisions.url });

    await expect(settings.read(NON_OWNER)).rejects.toMatchObject({
      name: "ApplicationError",
      code: "FORBIDDEN",
    });
    expect(fakeDecisions.httpRequests()).toEqual([]);
  },
);

test.for(["broccoli_ai", "openrouter"] as const)(
  "refuses a non-owner choosing %s before contacting providers or saving",
  async (source, { orm, fakeDecisions }) => {
    const settings = aiSettings(orm, { url: fakeDecisions.url });

    await expect(
      settings.save(NON_OWNER, { source, openRouterKey: "given-key" }),
    ).rejects.toMatchObject({
      name: "ApplicationError",
      code: "FORBIDDEN",
    });
    expect(fakeDecisions.httpRequests()).toEqual([]);
    expect(await settings.read(OWNER)).toEqual({ source: "broccoli_ai", openRouterKey: null });
  },
);

test.for(["broccoli_ai", "openrouter"] as const)(
  "refuses a managed choice of %s without contacting providers or saving",
  async (source, { orm, seed, fakeDecisions }) => {
    await seed.aiSource("openrouter", "saved-key");
    const settings = aiSettings(orm, { mode: "managed", url: fakeDecisions.url });

    await expect(
      settings.save(OWNER, { source, openRouterKey: "given-key" }),
    ).rejects.toMatchObject({
      name: "ApplicationError",
      code: "CONFLICT",
    });
    expect(fakeDecisions.httpRequests()).toEqual([]);
    expect(await aiSettings(orm).read(OWNER)).toEqual({
      source: "openrouter",
      openRouterKey: { key: "saved-key", origin: "saved" },
    });
  },
);

test("checks and saves the trimmed replacement before returning the current AI", async ({
  orm,
  seed,
  fakeDecisions,
}) => {
  await seed.aiSource("broccoli_ai", "old-key");
  fakeDecisions.acceptKey("replacement-key");
  const settings = aiSettings(orm, { url: fakeDecisions.url, environmentKey: "environment-key" });

  const ai = await settings.save(OWNER, {
    source: "openrouter",
    openRouterKey: "  replacement-key \n",
  });

  expect(fakeDecisions.httpRequests()).toMatchObject([
    { path: "/v1/key", headers: { authorization: "Bearer replacement-key" } },
  ]);
  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "replacement-key", origin: "saved" },
  });
  expect(await settings.read(OWNER)).toEqual(ai);
});

test("encrypts the saved key at rest", async ({ orm, fakeDecisions }) => {
  fakeDecisions.acceptKey("saved-key");
  const settings = aiSettings(orm, { url: fakeDecisions.url });

  await settings.save(OWNER, { source: "openrouter", openRouterKey: "saved-key" });

  const { rows } = await orm.execute<{ encrypted_openrouter_key: string }>(
    sql`select encrypted_openrouter_key from instance`,
  );
  const encrypted = rows[0]!.encrypted_openrouter_key;
  expect(encrypted).not.toBe("saved-key");
  expect(TEST_SECRET_BOX.decrypt(encrypted)).toBe("saved-key");
});

test.for([undefined, null, " \n "])(
  "requires an OpenRouter key when none is available (%s)",
  async (openRouterKey, { orm, fakeDecisions }) => {
    const settings = aiSettings(orm, { url: fakeDecisions.url });

    await expect(
      settings.save(OWNER, { source: "openrouter", openRouterKey }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "openRouterKey", code: "required" }],
    });
    expect(fakeDecisions.httpRequests()).toEqual([]);
    expect(await settings.read(OWNER)).toEqual({ source: "broccoli_ai", openRouterKey: null });
  },
);

test.for([undefined, null, " \n "])(
  "checks the saved key before the environment key without a replacement (%s)",
  async (openRouterKey, { orm, seed, fakeDecisions }) => {
    await seed.aiSource("broccoli_ai", "saved-key");
    fakeDecisions.acceptKey("saved-key");
    const settings = aiSettings(orm, { url: fakeDecisions.url, environmentKey: "environment-key" });

    const ai = await settings.save(OWNER, { source: "openrouter", openRouterKey });

    expect(fakeDecisions.httpRequests()).toMatchObject([
      { path: "/v1/key", headers: { authorization: "Bearer saved-key" } },
    ]);
    expect(ai).toEqual({
      source: "openrouter",
      openRouterKey: { key: "saved-key", origin: "saved" },
    });
    expect(await settings.read(OWNER)).toEqual(ai);
  },
);

test("checks the environment key without saving a copy", async ({ orm, fakeDecisions }) => {
  fakeDecisions.acceptKey("environment-key");
  const settings = aiSettings(orm, { url: fakeDecisions.url, environmentKey: "environment-key" });

  const ai = await settings.save(OWNER, { source: "openrouter" });

  expect(fakeDecisions.httpRequests()).toMatchObject([
    { path: "/v1/key", headers: { authorization: "Bearer environment-key" } },
  ]);
  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
  expect(await settings.read(OWNER)).toEqual(ai);
  expect(await aiSettings(orm).read(OWNER)).toEqual({ source: "openrouter", openRouterKey: null });
});

test("keeps settings when a key is rejected", async ({ orm, seed, fakeDecisions }) => {
  await seed.aiSource("broccoli_ai", "saved-key");
  const settings = aiSettings(orm, { url: fakeDecisions.url });
  const before = await settings.read(OWNER);

  await expect(
    settings.save(OWNER, { source: "openrouter", openRouterKey: "rejected-key" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "openRouterKey", code: "rejected" }],
  });
  expect(await settings.read(OWNER)).toEqual(before);
});

test("reports a retryable OpenRouter failure without saving the choice", async ({ orm, seed }) => {
  await seed.aiSource("broccoli_ai", "saved-key");
  const provider = await startFakeHttpServer(() => ({ status: 503 }));
  onTestFinished(() => provider.stop());
  const settings = aiSettings(orm, { url: provider.url });
  const before = await settings.read(OWNER);

  await expect(
    settings.save(OWNER, { source: "openrouter", openRouterKey: "given-key" }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(provider.paths).toEqual(["/v1/key"]);
  expect(await settings.read(OWNER)).toEqual(before);
});

test.for([OWNER, SETUP_HOLDER, SYSTEM])(
  "prepares Broccoli AI and keeps the saved key for setup access",
  async (ctx, { orm, seed, fakeDecisions }) => {
    await seed.aiSource("openrouter", "saved-key");
    const settings = aiSettings(orm, { url: fakeDecisions.url });

    const ai = await settings.save(ctx, { source: "broccoli_ai" });

    expect(fakeDecisions.httpRequests()).toMatchObject([{ path: "/v1/tokens" }]);
    expect(ai).toEqual({
      source: "broccoli_ai",
      openRouterKey: { key: "saved-key", origin: "saved" },
    });
    expect(await settings.read(OWNER)).toEqual(ai);
  },
);

test("keeps settings when free use is refused", async ({ orm, seed, fakeDecisions }) => {
  await seed.aiSource("openrouter", "saved-key");
  fakeDecisions.refuseTokens(429, "free_period_used");
  const settings = aiSettings(orm, { url: fakeDecisions.url });
  const before = await settings.read(OWNER);

  await expect(settings.save(OWNER, { source: "broccoli_ai" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "source", code: "free_period_used" }],
  });
  expect(await settings.read(OWNER)).toEqual(before);
});

test.for([403, 503])(
  "reports other Broccoli AI failures as unavailable (HTTP %s)",
  async (status, { orm, seed, fakeDecisions }) => {
    await seed.aiSource("openrouter", "saved-key");
    fakeDecisions.refuseTokens(status, "service_unavailable");
    const settings = aiSettings(orm, { url: fakeDecisions.url });
    const before = await settings.read(OWNER);

    await expect(settings.save(OWNER, { source: "broccoli_ai" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(await settings.read(OWNER)).toEqual(before);
  },
);

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
