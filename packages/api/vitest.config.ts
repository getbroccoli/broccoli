import { defineConfig } from "vitest/config";

export default defineConfig({
  // Load the same graphql build as Node and Apollo do; two copies break `instanceof GraphQLError`.
  resolve: { alias: [{ find: /^graphql$/, replacement: "graphql/index.js" }] },
  test: {
    include: ["src/**/*.test.ts"],
    // Integration tests need Postgres; `pnpm test:integration` runs them. Evals call the real model;
    // `pnpm eval` and `pnpm eval:external-agent` run them.
    exclude: [
      "src/**/*.int.test.ts",
      "src/**/*.eval.test.ts",
      "src/**/*.external-agent-eval.test.ts",
    ],
  },
});
