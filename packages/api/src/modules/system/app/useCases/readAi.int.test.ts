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

test("reports no AI choice on a managed instance", async ({ orm, transact }) => {
  await transact((tx) => storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai" }));
  const system = systemUseCases(orm, { mode: "managed", environmentKey: "managed-key" });

  expect(await system.readAi(OWNER)).toBeNull();
});

test("reports the environment key and its origin", async ({ orm }) => {
  const system = systemUseCases(orm, { environmentKey: "environment-key" });

  expect(await system.readAi(OWNER)).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

test("reports the saved choice instead of the environment's default", async ({ orm, transact }) => {
  await transact((tx) => storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai" }));
  const system = systemUseCases(orm, { environmentKey: "environment-key" });

  expect(await system.readAi(OWNER)).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

test.for([SETUP_HOLDER, SYSTEM])(
  "allows setup access to read the current AI",
  async (ctx, { orm }) => {
    const system = systemUseCases(orm);

    expect(await system.readAi(ctx)).toEqual({ source: "broccoli_ai", openRouterKey: null });
  },
);

test("refuses a non-owner without checking providers or saving a choice", async ({ orm }) => {
  const checkOpenRouterKey = vi.fn();
  const prepareBroccoliAi = vi.fn();
  const system = systemUseCases(orm, { checkOpenRouterKey, prepareBroccoliAi });

  await expect(system.readAi(NON_OWNER)).rejects.toMatchObject({
    name: "ApplicationError",
    code: "FORBIDDEN",
  });

  expect(checkOpenRouterKey).not.toHaveBeenCalled();
  expect(prepareBroccoliAi).not.toHaveBeenCalled();
  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({ source: null, openRouterKey: null });
});
