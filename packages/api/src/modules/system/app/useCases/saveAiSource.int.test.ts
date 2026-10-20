import { vi } from "vitest";

import {
  expect,
  NON_OWNER,
  OWNER,
  SETUP_HOLDER,
  SYSTEM,
  systemUseCases,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

import { readAiSource, storeAiSource } from "../../../../core/instance";
import { DecisionsError } from "../../../../integrations/ai";

test.for(["broccoli_ai", "openrouter"] as const)(
  "refuses a non-owner choosing %s before checking or saving it",
  async (source, { orm }) => {
    const checkOpenRouterKey = vi.fn();
    const prepareBroccoliAi = vi.fn();
    const system = systemUseCases(orm, { checkOpenRouterKey, prepareBroccoliAi });

    await expect(
      system.saveAiSource(NON_OWNER, { source, openRouterKey: "given-key" }),
    ).rejects.toMatchObject({ name: "ApplicationError", code: "FORBIDDEN" });

    expect(checkOpenRouterKey).not.toHaveBeenCalled();
    expect(prepareBroccoliAi).not.toHaveBeenCalled();
    expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
  },
);

test.for(["broccoli_ai", "openrouter"] as const)(
  "refuses a managed choice of %s without checking providers",
  async (source, { orm }) => {
    const checkOpenRouterKey = vi.fn();
    const prepareBroccoliAi = vi.fn();
    const system = systemUseCases(orm, { mode: "managed", checkOpenRouterKey, prepareBroccoliAi });

    await expect(
      system.saveAiSource(OWNER, { source, openRouterKey: "given-key" }),
    ).rejects.toMatchObject({ name: "ApplicationError", code: "CONFLICT" });

    expect(checkOpenRouterKey).not.toHaveBeenCalled();
    expect(prepareBroccoliAi).not.toHaveBeenCalled();
    expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
  },
);

test("checks and saves the trimmed replacement before returning the current AI", async ({
  orm,
  transact,
}) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai", openRouterKey: "old-key" }),
  );
  const checkOpenRouterKey = vi.fn(() => Promise.resolve());
  const system = systemUseCases(orm, { environmentKey: "environment-key", checkOpenRouterKey });

  const ai = await system.saveAiSource(OWNER, {
    source: "openrouter",
    openRouterKey: "  replacement-key \n",
  });

  expect(checkOpenRouterKey).toHaveBeenCalledWith("replacement-key");
  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
    source: "openrouter",
    openRouterKey: "replacement-key",
  });
  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "replacement-key", origin: "saved" },
  });
  expect(ai).toEqual(await system.readAi(OWNER));
});

test.for([undefined, null, " \n "])(
  "requires an OpenRouter key when none is available (%s)",
  async (openRouterKey, { orm }) => {
    const system = systemUseCases(orm);

    await expect(
      system.saveAiSource(OWNER, { source: "openrouter", openRouterKey }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "openRouterKey", code: "required" }],
    });

    expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
  },
);

test.for([undefined, null, " \n "])(
  "checks the saved key before the environment key when no replacement is given (%s)",
  async (openRouterKey, { orm, transact }) => {
    await transact((tx) =>
      storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai", openRouterKey: "saved-key" }),
    );
    const checkOpenRouterKey = vi.fn(() => Promise.resolve());
    const system = systemUseCases(orm, { environmentKey: "environment-key", checkOpenRouterKey });

    const ai = await system.saveAiSource(OWNER, { source: "openrouter", openRouterKey });

    expect(checkOpenRouterKey).toHaveBeenCalledWith("saved-key");
    expect(ai).toEqual({
      source: "openrouter",
      openRouterKey: { key: "saved-key", origin: "saved" },
    });
    expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
      source: "openrouter",
      openRouterKey: "saved-key",
    });
  },
);

test("checks the environment key without saving a copy", async ({ orm }) => {
  const checkOpenRouterKey = vi.fn(() => Promise.resolve());
  const system = systemUseCases(orm, { environmentKey: "environment-key", checkOpenRouterKey });

  const ai = await system.saveAiSource(OWNER, { source: "openrouter" });

  expect(checkOpenRouterKey).toHaveBeenCalledWith("environment-key");
  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
    source: "openrouter",
    openRouterKey: null,
  });
});

test("keeps the saved key and source when the replacement is rejected", async ({
  orm,
  transact,
}) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai", openRouterKey: "saved-key" }),
  );
  const system = systemUseCases(orm, {
    checkOpenRouterKey: () => Promise.reject(new DecisionsError("Key refused", false)),
  });

  await expect(
    system.saveAiSource(OWNER, { source: "openrouter", openRouterKey: "rejected-key" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "openRouterKey", code: "rejected" }],
  });

  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
    source: "broccoli_ai",
    openRouterKey: "saved-key",
  });
});

test("reports a retryable OpenRouter failure without saving the choice", async ({ orm }) => {
  const system = systemUseCases(orm, {
    checkOpenRouterKey: () => Promise.reject(new DecisionsError("Provider unavailable", true)),
  });

  await expect(
    system.saveAiSource(OWNER, { source: "openrouter", openRouterKey: "given-key" }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });

  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
});

test.for([OWNER, SETUP_HOLDER, SYSTEM])(
  "prepares Broccoli AI and saves the choice for setup access",
  async (ctx, { orm }) => {
    const prepareBroccoliAi = vi.fn(() => Promise.resolve());
    const system = systemUseCases(orm, { prepareBroccoliAi });

    const ai = await system.saveAiSource(ctx, { source: "broccoli_ai" });

    expect(prepareBroccoliAi).toHaveBeenCalledOnce();
    expect(ai).toEqual({ source: "broccoli_ai", openRouterKey: null });
    expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
      source: "broccoli_ai",
      openRouterKey: null,
    });
  },
);

test("reports an already used free period on the source without saving it", async ({ orm }) => {
  const system = systemUseCases(orm, {
    prepareBroccoliAi: () =>
      Promise.reject(new DecisionsError("Token refused", false, null, "free_period_used")),
  });

  await expect(system.saveAiSource(OWNER, { source: "broccoli_ai" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "source", code: "free_period_used" }],
  });

  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
});

test.for([false, true])(
  "reports other Broccoli AI failures as unavailable (retryable: %s)",
  async (retryable, { orm }) => {
    const system = systemUseCases(orm, {
      prepareBroccoliAi: () => Promise.reject(new DecisionsError("Relay unavailable", retryable)),
    });

    await expect(system.saveAiSource(OWNER, { source: "broccoli_ai" })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });

    expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
  },
);
