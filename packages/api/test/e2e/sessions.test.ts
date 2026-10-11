import { expect, test } from "#test/support";

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
