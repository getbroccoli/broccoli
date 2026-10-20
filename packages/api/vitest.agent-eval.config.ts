import { defineConfig } from "vitest/config";

// The agent evals call a larger model with your key, so they cost more than `pnpm eval` and run
// only on their own; they are never part of `pnpm check` or CI.
if (!process.env.EVAL_OPEN_ROUTER_KEY) {
  throw new Error("Set EVAL_OPEN_ROUTER_KEY to run the evals");
}

export default defineConfig({
  test: {
    include: ["src/**/*.agent-eval.test.ts"],
    reporters: ["verbose"],
    globalSetup: ["test/support/globalSetup.ts"],
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
});
