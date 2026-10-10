import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { RunningServer } from "../../src/core/server";
import { createTestDatabase, type TestDatabase } from "./support/test-databases";
import { startTestServer } from "./support/test-server";

const run = inject("testRun");

describe("GraphQL", () => {
  let database: TestDatabase;
  let server: RunningServer;

  beforeAll(async () => {
    database = await createTestDatabase(run);
    server = await startTestServer(database.url);
  });

  afterAll(async () => {
    await server.stop();
    await database.drop();
  });

  it("answers the ping query with pong", async () => {
    const response = await fetch(`${server.url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ ping }" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { ping: "pong" } });
  });

  it("rejects introspection with a validation error", async () => {
    const response = await fetch(`${server.url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty(
      "errors.0.extensions.code",
      "GRAPHQL_VALIDATION_FAILED",
    );
  });
});
