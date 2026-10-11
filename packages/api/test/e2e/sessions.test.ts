import { inject, onTestFinished } from "vitest";

import {
  createBrowser,
  createTestDatabase,
  expect,
  startDisconnectingProxy,
  startTestServer,
  test,
  TEST_OWNER,
  waitForStartup,
} from "#test/support";

const createMutation = `
  mutation CreateEmployee($input: EmployeeCreateInput!) {
    employee { create(input: $input) { id } }
  }
`;

const listQuery = `
  query Employees($first: Int, $after: String) {
    employees(first: $first, after: $after) {
      edges { cursor node { id } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

test("refuses an owner-only query without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql(listQuery, { first: 2 });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", { code: "UNAUTHENTICATED", fieldErrors: [] });
});

test("refuses an owner-only mutation without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql(createMutation, {
    input: { firstName: "Employee", lastName: "One", email: "employee.one@example.com" },
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", { code: "UNAUTHENTICATED", fieldErrors: [] });
});

test("masks a database failure while reading the session", async () => {
  const database = await createTestDatabase(inject("testRun"));
  onTestFinished(() => database.drop());
  const proxy = await startDisconnectingProxy(database.url);
  onTestFinished(() => proxy.disconnect());
  const server = await startTestServer(proxy.url);
  onTestFinished(() => server.stop());
  expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });
  const browser = createBrowser(server.url);
  const setupResponse = await browser.post("/api/auth/setup", TEST_OWNER);
  expect(setupResponse.status).toBe(200);

  await proxy.disconnect();
  const response = await browser.graphql("{ employees(first: 1) { edges { cursor } } }");
  const bodyText = await response.text();
  const body: unknown = JSON.parse(bodyText);

  expect(body).toHaveProperty("errors.length", 1);
  expect(body).toHaveProperty("errors.0.message", "Internal server error");
  expect(body).toHaveProperty("errors.0.extensions", { code: "INTERNAL_SERVER_ERROR" });
  expect(bodyText.toLowerCase()).not.toContain("select");
});
