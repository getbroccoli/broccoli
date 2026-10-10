import { defineConfig } from "vitest/config";

export default defineConfig({
  // Load the same graphql build as Node and Apollo do; two copies break `instanceof GraphQLError`.
  resolve: { alias: [{ find: /^graphql$/, replacement: "graphql/index.js" }] },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
