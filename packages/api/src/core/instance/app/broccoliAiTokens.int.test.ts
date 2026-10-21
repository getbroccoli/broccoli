import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onTestFinished } from "vitest";

import { expect, NON_OWNER, SYSTEM, test, TEST_SECRET_BOX } from "#test/support";

import { instance, instanceRepository } from "../db";
import type { Orm } from "../../db";
import { createBroccoliAiTokens } from "./broccoliAiTokens";

test("keeps an existing trial token after the instance database is cleared", async ({ orm }) => {
  const { tokens } = await tokensInFreshFolder(orm);
  await instanceRepository(orm).saveBroccoliAiToken(TEST_SECRET_BOX.encrypt("existing-trial"));
  expect(await tokens.read(SYSTEM)).toBe("existing-trial");

  await orm.delete(instance);

  expect(await tokens.read(SYSTEM)).toBe("existing-trial");
  expect(await instanceRepository(orm).readBroccoliAiToken()).toBeNull();
});

test("keeps a newly issued token outside the instance database", async ({ orm }) => {
  const { tokens, dataDir } = await tokensInFreshFolder(orm);

  await tokens.save(SYSTEM, "new-trial");
  await orm.delete(instance);

  expect(await tokens.read(SYSTEM)).toBe("new-trial");
  const path = join(dataDir, "secrets", "broccoli-ai-token");
  expect(await readFile(path, "utf8")).not.toContain("new-trial");
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("uses the replacement token even when an old database backup is restored", async ({ orm }) => {
  const { tokens } = await tokensInFreshFolder(orm);
  await tokens.save(SYSTEM, "old-trial");
  await instanceRepository(orm).saveBroccoliAiToken(TEST_SECRET_BOX.encrypt("old-trial"));

  await tokens.save(SYSTEM, "replacement-trial");

  expect(await tokens.read(SYSTEM)).toBe("replacement-trial");
});

test("keeps the database token when moving it to the data folder fails", async ({ orm }) => {
  const { tokens, dataDir } = await tokensInFreshFolder(orm);
  const encrypted = TEST_SECRET_BOX.encrypt("existing-trial");
  await instanceRepository(orm).saveBroccoliAiToken(encrypted);
  await writeFile(join(dataDir, "secrets"), "blocks the secrets directory");

  await expect(tokens.read(SYSTEM)).rejects.toThrow();

  expect(await instanceRepository(orm).readBroccoliAiToken()).toBe(encrypted);
});

test("a fresh data folder and database have no trial token", async ({ orm }) => {
  const { tokens } = await tokensInFreshFolder(orm);

  expect(await tokens.read(SYSTEM)).toBeNull();
});

test("refuses a non-owner reading or saving the trial token", async ({ orm }) => {
  const { tokens, dataDir } = await tokensInFreshFolder(orm);

  expect(() => tokens.read(NON_OWNER)).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  expect(() => tokens.save(NON_OWNER, "new-trial")).toThrow(
    expect.objectContaining({ code: "FORBIDDEN" }),
  );

  expect(await readdir(dataDir)).toEqual([]);
});

async function tokensInFreshFolder(orm: Orm) {
  const dataDir = await mkdtemp(join(tmpdir(), "broccoli-token-"));
  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));
  return { tokens: createBroccoliAiTokens({ orm, secretBox: TEST_SECRET_BOX, dataDir }), dataDir };
}
