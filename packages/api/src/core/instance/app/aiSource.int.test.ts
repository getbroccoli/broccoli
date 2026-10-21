import { expect, NON_OWNER, SETUP_HOLDER, test } from "#test/support";

import type { Orm, Transact } from "../../db";
import {
  clearOldBroccoliAiToken,
  readAiSource,
  readInstance,
  readOldBroccoliAiToken,
  saveAiSource,
} from ".";

const calls = {
  readAiSource: (orm) => readAiSource(NON_OWNER, orm),
  saveAiSource: (_orm, transact) => transact((tx) => saveAiSource(NON_OWNER, tx, "broccoli_ai")),
  readOldBroccoliAiToken: (orm) => readOldBroccoliAiToken(NON_OWNER, orm),
  clearOldBroccoliAiToken: (orm) => clearOldBroccoliAiToken(NON_OWNER, orm),
} satisfies Record<string, (orm: Orm, transact: Transact) => Promise<unknown>>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in non-owner without changing the stored source",
  async ([, call], { orm, transact }) => {
    await expect(Promise.resolve().then(() => call(orm, transact))).rejects.toMatchObject({
      name: "ApplicationError",
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
    });

    expect((await readInstance(orm)).aiSource).toBeNull();
  },
);

test("the setup holder can save an AI source and read it back", async ({ orm, transact }) => {
  await transact((tx) => saveAiSource(SETUP_HOLDER, tx, "broccoli_ai"));

  const saved = await readAiSource(SETUP_HOLDER, orm);

  expect(saved).toEqual({ source: "broccoli_ai", encryptedOpenRouterKey: null });
});
