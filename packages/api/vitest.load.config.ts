import { defineConfig } from "vitest/config";

// Load tests fill Postgres with a large workspace; they are for development, never `pnpm check` or CI.
export default defineConfig({
  test: {
    include: ["src/**/*.load.test.ts"],
    globalSetup: ["test/support/globalSetup.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 30_000,
  },
});
