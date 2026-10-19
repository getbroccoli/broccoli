import { sql } from "drizzle-orm";

import { expect, test, TEST_SECRET_BOX } from "#test/support";

import { readAiConfig, readAiSource, storeAiSource } from "./aiSource";

test("a new instance has no AI choice", async ({ orm }) => {
  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
    source: null,
    openRouterKey: null,
  });
});

test("reads back the saved choice and key", async ({ orm, transact }) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "openrouter", openRouterKey: "saved-key" }),
  );

  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
    source: "openrouter",
    openRouterKey: "saved-key",
  });
});

test("managed AI ignores the saved source and key", async ({ orm, transact }) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai", openRouterKey: "saved-key" }),
  );

  const ai = await readAiConfig(orm, TEST_SECRET_BOX, {
    mode: "managed",
    environmentKey: "environment-key",
  });

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

test("self-hosted AI uses the saved source and key", async ({ orm, transact }) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai", openRouterKey: "saved-key" }),
  );

  const ai = await readAiConfig(orm, TEST_SECRET_BOX, {
    mode: "self_hosted",
    environmentKey: "environment-key",
  });

  expect(ai).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

test("encrypts the saved key at rest", async ({ orm, transact }) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "openrouter", openRouterKey: "saved-key" }),
  );

  const { rows } = await orm.execute<{ encrypted_openrouter_key: string }>(
    sql`select encrypted_openrouter_key from instance`,
  );
  const encrypted = rows[0]!.encrypted_openrouter_key;
  expect(encrypted).not.toBe("saved-key");
  expect(TEST_SECRET_BOX.decrypt(encrypted)).toBe("saved-key");
});

test("choosing Broccoli AI without a key keeps the saved key", async ({ orm, transact }) => {
  await transact((tx) =>
    storeAiSource(tx, TEST_SECRET_BOX, { source: "openrouter", openRouterKey: "saved-key" }),
  );

  await transact((tx) => storeAiSource(tx, TEST_SECRET_BOX, { source: "broccoli_ai" }));

  expect(await readAiSource(orm, TEST_SECRET_BOX)).toEqual({
    source: "broccoli_ai",
    openRouterKey: "saved-key",
  });
});
