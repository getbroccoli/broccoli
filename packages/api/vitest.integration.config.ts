import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    // Reuse imports across files; fixtures still create a fresh database per test.
    isolate: false,
    globalSetup: ["test/support/globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
