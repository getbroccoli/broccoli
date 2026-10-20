import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onTestFinished } from "vitest";

import { expect, test, TEST_SECRET_BOX } from "#test/support";

import { instance, instanceRepository } from "../db";
import { readBroccoliAiToken, saveBroccoliAiToken } from "./broccoliAiToken";

test("keeps an existing trial token after the instance database is cleared", async ({ orm }) => {
  const dataDir = await tokenFolder();
  await instanceRepository(orm).saveBroccoliAiToken(TEST_SECRET_BOX.encrypt("existing-trial"));
  expect(await readBroccoliAiToken(orm, TEST_SECRET_BOX, dataDir)).toBe("existing-trial");

  await orm.delete(instance);

  expect(await readBroccoliAiToken(orm, TEST_SECRET_BOX, dataDir)).toBe("existing-trial");
  expect(await instanceRepository(orm).readBroccoliAiToken()).toBeNull();
});

test("keeps a newly issued token outside the instance database", async ({ orm }) => {
  const dataDir = await tokenFolder();

  await saveBroccoliAiToken(TEST_SECRET_BOX, dataDir, "new-trial");
  await orm.delete(instance);

  expect(await readBroccoliAiToken(orm, TEST_SECRET_BOX, dataDir)).toBe("new-trial");
  const path = join(dataDir, "secrets", "broccoli-ai-token");
  expect(await readFile(path, "utf8")).not.toContain("new-trial");
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("uses the replacement token even when an old database backup is restored", async ({ orm }) => {
  const dataDir = await tokenFolder();
  await saveBroccoliAiToken(TEST_SECRET_BOX, dataDir, "old-trial");
  await instanceRepository(orm).saveBroccoliAiToken(TEST_SECRET_BOX.encrypt("old-trial"));

  await saveBroccoliAiToken(TEST_SECRET_BOX, dataDir, "replacement-trial");

  expect(await readBroccoliAiToken(orm, TEST_SECRET_BOX, dataDir)).toBe("replacement-trial");
});

test("keeps the database token when moving it to the data folder fails", async ({ orm }) => {
  const dataDir = await tokenFolder();
  const encrypted = TEST_SECRET_BOX.encrypt("existing-trial");
  await instanceRepository(orm).saveBroccoliAiToken(encrypted);
  await writeFile(join(dataDir, "secrets"), "blocks the secrets directory");

  await expect(readBroccoliAiToken(orm, TEST_SECRET_BOX, dataDir)).rejects.toThrow();

  expect(await instanceRepository(orm).readBroccoliAiToken()).toBe(encrypted);
});

test("a fresh data folder and database have no trial token", async ({ orm }) => {
  const dataDir = await tokenFolder();

  expect(await readBroccoliAiToken(orm, TEST_SECRET_BOX, dataDir)).toBeNull();
});

async function tokenFolder(): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "broccoli-token-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  return dataDir;
}
