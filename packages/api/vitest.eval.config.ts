import { defineConfig } from "vitest/config";

// Evals call the real model with your key; they are never part of `pnpm check` or CI.
if (!process.env.EVAL_OPEN_ROUTER_KEY) {
  throw new Error("Set EVAL_OPEN_ROUTER_KEY to run the evals");
}

export default defineConfig({
  test: {
    include: ["src/**/*.eval.test.ts"],
    // Lists every case and prints the leak warnings of passing ones.
    reporters: ["verbose"],
    globalSetup: ["test/support/globalSetup.ts"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
