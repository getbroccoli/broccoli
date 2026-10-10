import { test as baseTest } from "vitest";

import { TestEnv } from "./test-env";

/** Vitest's `test` with a fresh `env` for every test. */
export const test = baseTest.extend<{ env: TestEnv }>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  env: async ({}, use) => {
    const env = await TestEnv.start();
    await use(env);
    await env.stop();
  },
});
