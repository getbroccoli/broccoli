import { ApolloServer, HeaderMap } from "@apollo/server";
import { assert, expect, it, onTestFinished } from "vitest";

import { createContext, type GraphqlContext } from "./apollo";
import { formatError } from "./errors";

it("masks a failure while resolving the actor", async () => {
  const resolveActor = () =>
    Promise.reject(new Error('Failed query: select "owner_user_id" from "instance"'));
  const server = new ApolloServer<GraphqlContext>({
    typeDefs: "type Query { ping: String }",
    resolvers: { Query: { ping: () => "pong" } },
    formatError,
    includeStacktraceInErrorResponses: false,
  });
  await server.start();
  onTestFinished(() => server.stop());

  const response = await server.executeHTTPGraphQLRequest({
    httpGraphQLRequest: {
      method: "POST",
      headers: new HeaderMap([["content-type", "application/json"]]),
      search: "",
      body: { query: "{ ping }" },
    },
    context: () => createContext(resolveActor)({ req: { headers: {} } }),
  });

  assert(response.body.kind === "complete");
  expect(JSON.parse(response.body.string)).toEqual({
    errors: [{ message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
  });
  expect(response.body.string).not.toContain("owner_user_id");
});

it("puts the resolved actor in the context", async () => {
  const resolveActor = () => Promise.resolve({ userId: "owner-1", isOwner: true });
  const server = new ApolloServer<GraphqlContext>({
    typeDefs: "type Query { ping: String }",
    resolvers: {
      Query: {
        ping: (_parent: unknown, _args: unknown, context: GraphqlContext) => context.actor?.userId,
      },
    },
    formatError,
    includeStacktraceInErrorResponses: false,
  });
  await server.start();
  onTestFinished(() => server.stop());

  const response = await server.executeHTTPGraphQLRequest({
    httpGraphQLRequest: {
      method: "POST",
      headers: new HeaderMap([["content-type", "application/json"]]),
      search: "",
      body: { query: "{ ping }" },
    },
    context: () => createContext(resolveActor)({ req: { headers: {} } }),
  });

  assert(response.body.kind === "complete");
  expect(JSON.parse(response.body.string)).toEqual({ data: { ping: "owner-1" } });
});
