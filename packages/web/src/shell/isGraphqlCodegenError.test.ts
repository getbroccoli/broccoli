import { expect, it } from "vitest";

import { isGraphqlCodegenError } from "./isGraphqlCodegenError";

it("recognises a missing generated GraphQL export when a lazy page loads", () => {
  const error = new SyntaxError(
    "The requested module '/src/__generated__/graphql.ts' does not provide an export named 'ChooseAiDocument'",
  );

  expect(isGraphqlCodegenError(error)).toBe(true);
});

it("recognises generated module URLs with Vite timestamps", () => {
  const error = new SyntaxError(
    "The requested module 'http://localhost:5173/src/__generated__/graphql.ts?t=123' does not provide an export named 'AiStepDocument'",
  );

  expect(isGraphqlCodegenError(error)).toBe(true);
});

it.each([
  null,
  "Failed to fetch",
  new TypeError("Failed to fetch"),
  new SyntaxError("The requested module '/src/other.ts' does not provide an export named 'value'"),
  new TypeError("Failed to fetch dynamically imported module: /src/__generated__/graphql.ts"),
])("does not label unrelated failures as stale GraphQL code: %s", (error) => {
  expect(isGraphqlCodegenError(error)).toBe(false);
});
