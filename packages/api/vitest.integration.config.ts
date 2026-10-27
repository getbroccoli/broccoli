import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["test/support/globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
