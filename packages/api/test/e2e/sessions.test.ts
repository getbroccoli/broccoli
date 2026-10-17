import { inject, onTestFinished } from "vitest";

import {
  createBrowser,
  createTestDatabase,
  expect,
  startDisconnectingProxy,
  startTestBroccoliServer,
  test,
  TEST_OWNER,
  waitForStartup,
} from "#test/support";

const createMutation = `
  mutation CreateEmployee($input: EmployeeCreateInput!) {
    employee { create(input: $input) { employee { id } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } }
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

test("renews a session cookie that is due for renewal", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await env.expireSessionsIn(5);

  const response = await browser.graphql("{ setup { id step } }");

  const cookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  expect(cookie).toContain("better-auth.session_token=");
  expect(cookie).toContain("Max-Age=604800");
});

test("does not resend the cookie of a fresh session", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql("{ setup { id step } }");

  expect(await response.json()).toHaveProperty("data.setup.id", "instance");
  expect(response.headers.getSetCookie()).not.toEqual(
    expect.arrayContaining([expect.stringContaining("better-auth.session_token=")]),
  );
});

test("masks a database failure while reading the session", async () => {
  const database = await createTestDatabase(inject("testRun"));
  onTestFinished(() => database.drop());
  const proxy = await startDisconnectingProxy(database.url);
  onTestFinished(() => proxy.disconnect());
  const server = await startTestBroccoliServer(proxy.url);
  onTestFinished(() => server.stop());
  expect(await waitForStartup(server)).toEqual({ httpStatus: 200, status: "ready" });
  const browser = createBrowser(server.url);
  expect((await browser.post("/api/auth/setup/start", undefined)).status).toBe(200);
  await browser.graphql(
    `mutation { company { update(input: { name: "Acme Corp" }) { company { id } error { __typename } } } }`,
  );
  await browser.graphql("mutation { import { skip { import { id } } } }");
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
