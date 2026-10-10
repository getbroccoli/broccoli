import { GraphQLError, parse } from "graphql";
import { expect, it } from "vitest";

import { formatError } from "./errors";

it("masks a plain resolver error while preserving its location and path", () => {
  const error = new GraphQLError("Database connection failed", {
    originalError: new Error("Database connection failed"),
    nodes: parse("{ ping }").definitions[0],
    path: ["ping"],
    extensions: { code: "INTERNAL_SERVER_ERROR", stacktrace: ["private details"] },
  });
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toEqual({
    message: "Internal server error",
    locations: formatted.locations,
    path: ["ping"],
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
});

it("passes a deliberate GraphQLError through unchanged", () => {
  const originalError = new GraphQLError("Permission denied", {
    extensions: { code: "FORBIDDEN" },
  });
  const error = new GraphQLError(originalError.message, {
    originalError,
    path: ["ping"],
  });
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toBe(formatted);
});
