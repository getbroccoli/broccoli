import { inject, test as baseTest } from "vitest";

import { connectDatabase, type Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTestDatabase } from "./testDatabases";
import { TestEnv } from "./testEnv";
import { TestSeed } from "./testSeed";

/**
 * Vitest's `test` with fixtures, each created only for the tests that use it:
 * `env`, a running Broccoli for end-to-end tests (seed it with `env.seed`), and
 * `orm` and `seed`, a fresh migrated database for use-case integration tests.
 */
export const test = baseTest.extend<{ env: TestEnv; orm: Orm; seed: TestSeed }>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  env: async ({}, use) => {
    const env = await TestEnv.start();
    await use(env);
    await env.stop();
  },
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  orm: async ({}, use) => {
    const testDatabase = await createTestDatabase(inject("testRun"));
    const database = connectDatabase(testDatabase.url, createLogger("silent"));
    await use(database.orm);
    await database.close();
    await testDatabase.drop();
  },
  seed: async ({ orm }, use) => {
    await use(new TestSeed(orm));
  },
});
