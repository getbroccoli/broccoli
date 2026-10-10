import { buildSchema, execute, GraphQLError, parse } from "graphql";
import { assert, expect, it } from "vitest";

import { ApplicationError } from "../application-error";
import { formatError } from "./errors";

it("passes an ApplicationError through with its code and field errors", () => {
  const originalError = new ApplicationError("INVALID_INPUT", "The input is invalid.", [
    { field: "email", code: "taken" },
  ]);
  const error = new GraphQLError(originalError.message, {
    originalError,
    nodes: parse("mutation { employee { create { id } } }").definitions[0],
    path: ["employee", "create"],
    extensions: { code: "INTERNAL_SERVER_ERROR", stacktrace: ["private details"] },
  });
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toEqual({
    message: "The input is invalid.",
    locations: formatted.locations,
    path: ["employee", "create"],
    extensions: {
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "email", code: "taken" }],
    },
  });
});

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

it("passes through a GraphQLError raised before execution", () => {
  const error = new GraphQLError("Unknown field", {
    extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
  });
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toBe(formatted);
});

it("masks an error raised while creating the request context", () => {
  const error = new GraphQLError(
    'Context creation failed: Failed query: select "owner_user_id" from "instance"',
    { extensions: { code: "INTERNAL_SERVER_ERROR" } },
  );

  const result = formatError(error.toJSON(), error);

  expect(result).toEqual({
    message: "Internal server error",
    locations: undefined,
    path: undefined,
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
});

it("masks a deliberately thrown GraphQLError with a path", () => {
  const originalError = new GraphQLError("Permission denied", {
    extensions: { code: "FORBIDDEN" },
  });
  const error = new GraphQLError(originalError.message, {
    originalError,
    path: ["ping"],
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

it("masks a GraphQL serialization error without exposing the returned value", async () => {
  const schema = buildSchema("type Query { ping: String }");
  const execution = await execute({
    schema,
    document: parse("{ ping }"),
    rootValue: { ping: { privateValue: "private details" } },
  });
  const error = execution.errors?.[0];
  assert(error);
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toEqual({
    message: "Internal server error",
    locations: formatted.locations,
    path: ["ping"],
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
});
