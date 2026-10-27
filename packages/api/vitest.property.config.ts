import { defineConfig } from "vitest/config";

// Property tests run many random cases against Postgres; they are for development, never `pnpm check` or CI.
export default defineConfig({
  test: {
    include: ["src/**/*.property.int.test.ts"],
    globalSetup: ["test/support/globalSetup.ts"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
