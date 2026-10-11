import { makeExecutableSchema } from "@graphql-tools/schema";
import { graphql } from "graphql";
import { expect, it } from "vitest";

import { ApplicationError } from "../applicationError";
import { requireSessionOutsidePublicFields } from "./publicFields";

const typeDefs = `
  directive @public on FIELD_DEFINITION
  type Query { open: String @public, secret: String }
  type Mutation { thing: Thing }
  type Thing { do: String }
`;

it("refuses a private field without a session before running its resolver", async () => {
  let resolverRan = false;
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      Query: {
        secret: () => {
          resolverRan = true;
          return "secret";
        },
      },
    },
  });
  requireSessionOutsidePublicFields(schema);

  const result = await graphql({
    schema,
    source: "{ secret }",
    contextValue: { optionalActor: null },
  });

  expect(result.errors).toHaveLength(1);
  expect(result.errors?.[0]?.originalError).toBeInstanceOf(ApplicationError);
  expect(result.errors?.[0]?.originalError).toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Sign in to continue.",
  });
  expect(resolverRan).toBe(false);
});

it("answers a public field without a session", async () => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: { Query: { open: () => "open" } },
  });
  requireSessionOutsidePublicFields(schema);

  const result = await graphql({
    schema,
    source: "{ open }",
    contextValue: { optionalActor: null },
  });

  expect(result).toEqual({ data: { open: "open" } });
});

it("answers a private field with a signed-in user", async () => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: { Query: { secret: () => "secret" } },
  });
  requireSessionOutsidePublicFields(schema);

  const result = await graphql({
    schema,
    source: "{ secret }",
    contextValue: {
      optionalActor: { userId: "user-1", email: "user@example.com", isOwner: false },
    },
  });

  expect(result).toEqual({ data: { secret: "secret" } });
});

it("refuses a private mutation namespace without a session", async () => {
  let resolverRan = false;
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      Mutation: {
        thing: () => {
          resolverRan = true;
          return { do: "done" };
        },
      },
    },
  });
  requireSessionOutsidePublicFields(schema);

  const result = await graphql({
    schema,
    source: "mutation { thing { do } }",
    contextValue: { optionalActor: null },
  });

  expect(result.errors).toHaveLength(1);
  expect(result.errors?.[0]?.originalError).toBeInstanceOf(ApplicationError);
  expect(result.errors?.[0]?.originalError).toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Sign in to continue.",
  });
  expect(resolverRan).toBe(false);
});
