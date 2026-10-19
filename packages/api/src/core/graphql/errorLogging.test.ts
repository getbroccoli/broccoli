import { ApolloServer } from "@apollo/server";
import { assert, expect, it, onTestFinished } from "vitest";

import { createLogger } from "../logger";
import { errorLoggingPlugin } from "./errorLogging";

it("logs a rejected variable without its input values", async () => {
  const lines: string[] = [];
  const logger = createLogger("debug", {
    write: (line) => {
      lines.push(line);
    },
  });
  const server = new ApolloServer({
    typeDefs: `
      input AiInput { enabled: Boolean! openRouterKey: String }
      type Query { choose(input: AiInput!): Boolean }
    `,
    plugins: [errorLoggingPlugin(logger)],
  });
  onTestFinished(() => server.stop());

  const response = await server.executeOperation({
    query: "query ($input: AiInput!) { choose(input: $input) }",
    variables: {
      input: { openRouterKey: "sk-or-v1-synthetic-secret" },
    },
  });

  assert(response.body.kind === "single");
  expect(response.body.singleResult.errors).toHaveLength(1);
  expect(lines.join("\n")).toContain("GraphQL request rejected");
  expect(lines.join("\n")).not.toContain("sk-or-v1-synthetic-secret");
});
