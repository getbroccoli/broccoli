import { inject, test as baseTest } from "vitest";

import { connectDatabase, type Orm } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";
import { createTestDatabase, TestSeed } from "../support";

export { expect } from "vitest";
export { OWNER } from "../support";

/** Vitest's `test` with a fresh migrated database (`orm`) and a `seed` on it for every test. */
export const test = baseTest.extend<{ orm: Orm; seed: TestSeed }>({
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
