import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    globalSetup: ["test/e2e/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
