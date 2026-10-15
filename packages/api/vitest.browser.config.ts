import { defineConfig } from "vitest/config";

import e2e from "./vitest.e2e.config";

export default defineConfig({
  ...e2e,
  test: { ...e2e.test, include: ["test/browser/**/*.test.ts"], testTimeout: 60_000 },
});
