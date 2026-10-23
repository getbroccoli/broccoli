import { buildSchema, execute, graphql, GraphQLError, parse } from "graphql";
import { assert, expect, it, test } from "vitest";

import { ApplicationError } from "../applicationError";
import { formatError } from "./errors";

it("passes an ApplicationError through with its code and field errors", () => {
  const originalError = new ApplicationError("INVALID_INPUT", "The input is invalid.", [
    { field: "email", code: "taken" },
  ]);
  const error = new GraphQLError(originalError.message, {
    originalError,
    nodes: parse("mutation { createEmployee { id } }").definitions[0],
    path: ["createEmployee"],
    extensions: { code: "INTERNAL_SERVER_ERROR", stacktrace: ["private details"] },
  });
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toEqual({
    message: "The input is invalid.",
    locations: formatted.locations,
    path: ["createEmployee"],
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

  expect(result).toEqual(formatted);
});

it("preserves field and type names in a safe validation message", () => {
  const error = new GraphQLError('Cannot query field "nope" on type "Query".', {
    extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
  });
  const formatted = error.toJSON();

  const result = formatError(formatted, error);

  expect(result).toEqual(formatted);
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

it("removes input values from a variable coercion error", async () => {
  const schema = buildSchema(`
    input AiInput { enabled: Boolean! openRouterKey: String }
    type Query { choose(input: AiInput!): Boolean }
  `);
  const execution = await execute({
    schema,
    document: parse("query ($input: AiInput!) { choose(input: $input) }"),
    variableValues: {
      input: { openRouterKey: "sk-or-v1-synthetic-secret" },
    },
  });
  const error = execution.errors?.[0];
  assert(error);
  expect(error.message).toContain("sk-or-v1-synthetic-secret");

  const result = formatError(error.toJSON(), error);

  expect(result.message).toEqual(expect.any(String));
  expect(result.message.length).toBeGreaterThan(0);
  expect(JSON.stringify(result)).not.toContain("sk-or-v1-synthetic-secret");
});

test.for([
  'query { choose(input: { openRouterKey "sk-or-v1-synthetic-secret" }) }',
  'query { choose(input: { openRouterKey "\\"sk-or-v1-synthetic-secret\\"" }) }',
  'query { choose(input: { openRouterKey """prefix "sk-or-v1-synthetic-secret" suffix""" }) }',
])("removes an inline key from a syntax error (%s)", async (source) => {
  const schema = buildSchema(`
    input AiInput { openRouterKey: String }
    type Query { choose(input: AiInput!): Boolean }
  `);
  const execution = await graphql({
    schema,
    source,
  });
  const error = execution.errors?.[0];
  assert(error);
  expect(error.message).toContain("Syntax Error");
  expect(error.message).toContain("sk-or-v1-synthetic-secret");

  const result = formatError(error.toJSON(), error);

  expect(JSON.stringify(result)).not.toContain("sk-or-v1-synthetic-secret");
});
