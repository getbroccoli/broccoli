import { inject, test as baseTest } from "vitest";

import { connectDatabase, type Orm, type Transact } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { type FakeDecisions, startFakeDecisions } from "./fakeDecisions";
import { createTestDatabase } from "./testDatabases";
import { TestEnv } from "./testEnv";
import { startFakeSlack } from "./fakeSlack";
import { TestSeed } from "./testSeed";
import { testTransactor } from "./testTransactor";
import { importUseCases } from "./useCases";
import { selectPdfRows } from "./pdfCompletionInput";
import { sampleStaffPdf } from "./sampleStaffPdf";
import { OWNER } from "./testSecurityContext";

/**
 * Vitest's `test` with fixtures, each created only for the tests that use it:
 * `env`, a running Broccoli for end-to-end tests (seed it with `env.seed`), and
 * `orm` and `seed`, a fresh migrated database for use-case integration tests (its
 * URL is `databaseUrl`), `transact`, transactions on `orm` whose events nobody
 * receives, and `fakeDecisions`, a local model with scripted answers.
 */
export const test = baseTest.extend<{
  env: TestEnv;
  orm: Orm;
  databaseUrl: string;
  seed: TestSeed;
  transact: Transact;
  fakeDecisions: FakeDecisions;
}>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  env: async ({}, use) => {
    const env = await TestEnv.start();
    await use(env);
    await env.stop();
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  databaseUrl: async ({}, use) => {
    const testDatabase = await createTestDatabase(inject("testRun"));
    try {
      await use(testDatabase.url);
    } finally {
      await testDatabase.drop();
    }
  },
  orm: async ({ databaseUrl }, use) => {
    const database = connectDatabase(databaseUrl, createLogger("silent"));
    try {
      await use(database.orm);
    } finally {
      await database.close();
    }
  },
  seed: async ({ orm }, use) => {
    await use(new TestSeed(orm));
  },
  transact: async ({ orm }, use) => {
    await use(testTransactor(orm));
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  fakeDecisions: async ({}, use) => {
    const fake = await startFakeDecisions();
    try {
      await use(fake);
    } finally {
      await fake.stop();
    }
  },
});

/** PDF import use cases backed by both readers and a local completion provider. */
export const pdfImportTest = test.extend<{
  imports: ReturnType<typeof importUseCases>;
  sourceId: string;
}>({
  imports: async ({ orm, fakeDecisions: fake }, use) => {
    fake.answerCompletion("rows", selectPdfRows);
    await use(importUseCases(orm, { completions: fake.completions }));
  },
  sourceId: async ({ imports }, use) => {
    await use(
      await imports.files.uploadFile(OWNER, { name: "staff.pdf", bytes: sampleStaffPdf() }),
    );
  },
});

/** The API with a local Slack relay and workspace. */
export const slackTest = test.extend<{
  slack: Awaited<ReturnType<typeof startFakeSlack>>;
  env: TestEnv;
}>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  slack: async ({}, use) => {
    const slack = await startFakeSlack();
    try {
      await use(slack);
    } finally {
      await slack.stop();
    }
  },
  env: async ({ slack }, use) => {
    const env = await TestEnv.start({ slack: { relayUrl: slack.url, apiUrl: slack.url } });
    try {
      await use(env);
    } finally {
      await env.stop();
    }
  },
});
