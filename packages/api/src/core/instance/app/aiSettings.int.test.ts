import { sql } from "drizzle-orm";

import { expect, test, TEST_SECRET_BOX } from "#test/support";

import type { Orm } from "../../db";
import type { Mode } from "../../env";
import { createAiSettings } from "./aiSettings";

test("a new self-hosted instance without a key uses Broccoli AI", async ({ orm }) => {
  expect(await aiSettings(orm).read()).toEqual({ source: "broccoli_ai", openRouterKey: null });
});

test("reads back the saved choice and key", async ({ orm, transact }) => {
  const settings = aiSettings(orm);

  await transact((tx) => settings.save(tx, { source: "openrouter", openRouterKey: "saved-key" }));

  expect(await settings.read()).toEqual({
    source: "openrouter",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

test("managed AI ignores the saved source and key", async ({ orm, transact }) => {
  const settings = aiSettings(orm, { mode: "managed", environmentKey: "environment-key" });

  await transact((tx) => settings.save(tx, { source: "broccoli_ai", openRouterKey: "saved-key" }));

  expect(await settings.read()).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

test("self-hosted AI uses the saved source and key", async ({ orm, transact }) => {
  const settings = aiSettings(orm, { environmentKey: "environment-key" });

  await transact((tx) => settings.save(tx, { source: "broccoli_ai", openRouterKey: "saved-key" }));

  expect(await settings.read()).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

test("encrypts the saved key at rest", async ({ orm, transact }) => {
  await transact((tx) =>
    aiSettings(orm).save(tx, { source: "openrouter", openRouterKey: "saved-key" }),
  );

  const { rows } = await orm.execute<{ encrypted_openrouter_key: string }>(
    sql`select encrypted_openrouter_key from instance`,
  );
  const encrypted = rows[0]!.encrypted_openrouter_key;
  expect(encrypted).not.toBe("saved-key");
  expect(TEST_SECRET_BOX.decrypt(encrypted)).toBe("saved-key");
});

test("choosing Broccoli AI without a key keeps the saved key", async ({ orm, transact }) => {
  const settings = aiSettings(orm);
  await transact((tx) => settings.save(tx, { source: "openrouter", openRouterKey: "saved-key" }));

  await transact((tx) => settings.save(tx, { source: "broccoli_ai" }));

  expect(await settings.read()).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

function aiSettings(
  orm: Orm,
  {
    mode = "self_hosted",
    environmentKey = null,
  }: { mode?: Mode; environmentKey?: string | null } = {},
) {
  return createAiSettings({ orm, secretBox: TEST_SECRET_BOX, mode, environmentKey });
}
