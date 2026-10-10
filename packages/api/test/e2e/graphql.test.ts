import { expect, test } from "./support";

test("answers the ping query with pong", async ({ env }) => {
  const response = await env.browser().graphql("{ ping }");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { ping: "pong" } });
});

test("rejects introspection with a validation error", async ({ env }) => {
  const response = await env.browser().graphql("{ __schema { types { name } } }");

  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty(
    "errors.0.extensions.code",
    "GRAPHQL_VALIDATION_FAILED",
  );
});
