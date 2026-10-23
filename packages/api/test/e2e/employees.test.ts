import { expect, test } from "#test/support";

interface EmployeeListResponse {
  data: {
    employees: {
      edges: { cursor: string; node: { id: string } }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
}

const createMutation = `
  mutation CreateEmployee($input: EmployeeCreateInput!) {
    employee { create(input: $input) { employee { id firstName lastName email jobTitle startDate createdAt } error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } } } }
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

test("creates an employee through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const input = {
    firstName: "Employee",
    lastName: "One",
    email: "employee.one@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  };

  const response = await browser.graphql(createMutation, { input });
  const body = (await response.json()) as {
    data: { employee: { create: { employee: { id: string; createdAt: string }; error: null } } };
  };

  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("errors");
  expect(body.data.employee.create.error).toBeNull();
  const employee = body.data.employee.create.employee;
  expect(employee).toMatchObject(input);
  expect(employee.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  expect(employee.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("returns a taken employee email in the mutation payload", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await env.seed.employee({ email: "avery@example.com" });

  const response = await browser.graphql(createMutation, {
    input: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  });

  expect(await response.json()).toEqual({
    data: {
      employee: {
        create: {
          employee: null,
          error: {
            __typename: "InvalidInputError",
            message: "The input is invalid.",
            fields: [{ field: "email", code: "taken" }],
          },
        },
      },
    },
  });
});

test("lists employees through the API page by page", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const ada = await env.seed.employee({ firstName: "Ada" });
  const ben = await env.seed.employee({ firstName: "Ben" });
  const sam = await env.seed.employee({ firstName: "Sam" });

  const firstResponse = await browser.graphql(listQuery, { first: 2 });
  const firstPage = (await firstResponse.json()) as EmployeeListResponse;

  expect(firstResponse.status).toBe(200);
  expect(firstPage).not.toHaveProperty("errors");
  expect(firstPage.data.employees.edges.map((edge) => edge.node.id)).toEqual([ada.id, ben.id]);
  expect(firstPage.data.employees.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.data.employees.edges.at(-1)?.cursor,
  });

  const secondResponse = await browser.graphql(listQuery, {
    first: 2,
    after: firstPage.data.employees.pageInfo.endCursor,
  });
  const secondPage = (await secondResponse.json()) as EmployeeListResponse;

  expect(secondResponse.status).toBe(200);
  expect(secondPage).not.toHaveProperty("errors");
  expect(secondPage.data.employees.edges.map((edge) => edge.node.id)).toEqual([sam.id]);
  expect(secondPage.data.employees.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: secondPage.data.employees.edges.at(-1)?.cursor,
  });
});

test("sorts and filters employees through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const alpha = await env.seed.employee({ firstName: "Ada", email: "alpha.team@example.com" });
  await env.seed.employee({ firstName: "Ben", email: "other@example.com" });
  const zulu = await env.seed.employee({ firstName: "Zoe", email: "zulu.team@example.com" });

  const response = await browser.graphql(`
    query {
      employees(orderBy: { field: EMAIL, direction: DESC }, filter: { search: "team" }) {
        edges { cursor node { id } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `);
  const page = (await response.json()) as EmployeeListResponse;

  expect(response.status).toBe(200);
  expect(page).not.toHaveProperty("errors");
  expect(page.data.employees.edges.map((edge) => edge.node.id)).toEqual([zulu.id, alpha.id]);
});

test("editing an employee shows who changed what, when and why in their history", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  const employee = await env.seed.employee({ jobTitle: "Engineer" });

  const updated = await browser.graphql(
    `
    mutation UpdateEmployee($input: EmployeeUpdateInput!) {
      employee { update(input: $input) {
        employee { id jobTitle }
        error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } }
      } }
    }
  `,
    { input: { id: employee.id, jobTitle: "Lead", changeReason: "Promoted" } },
  );

  expect(updated.status).toBe(200);
  expect(await updated.json()).toEqual({
    data: {
      employee: { update: { employee: { id: employee.id, jobTitle: "Lead" }, error: null } },
    },
  });
  const response = await browser.graphql(
    `
    query EmployeeHistory($id: ID!) {
      employee(id: $id) { id history(first: 10) {
        edges { node {
          id operation occurredAt author { kind userId email } cause { kind ref } reason
          changes { field oldValue newValue }
        } }
        pageInfo { hasNextPage endCursor }
      } }
    }
  `,
    { id: employee.id },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        history: {
          edges: [
            {
              node: {
                id: expect.stringMatching(/^\d+$/) as unknown,
                operation: "UPDATED",
                occurredAt: expect.stringMatching(
                  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
                ) as unknown,
                author: { kind: "SIGNED_IN_USER", userId: user.id, email: user.email },
                cause: { kind: "EDITED_DIRECTLY", ref: null },
                reason: "Promoted",
                changes: [{ field: "jobTitle", oldValue: "Engineer", newValue: "Lead" }],
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: expect.any(String) as unknown },
        },
      },
    },
  });
});

test("deleting an employee keeps their history readable through recordHistory", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const input = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };
  const created = await browser.graphql(createMutation, { input });
  const body = (await created.json()) as {
    data: { employee: { create: { employee: { id: string }; error: null } } };
  };
  expect(body.data.employee.create.error).toBeNull();
  const { id } = body.data.employee.create.employee;

  const deleted = await browser.graphql(
    `
    mutation DeleteEmployee($input: EmployeeDeleteInput!) {
      employee { delete(input: $input) {
        deletedEmployeeId error { __typename ... on Error { message } }
      } }
    }
  `,
    { input: { id, changeReason: "Left" } },
  );

  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({
    data: { employee: { delete: { deletedEmployeeId: id, error: null } } },
  });
  const history = await browser.graphql(
    `
    query DeletedEmployeeHistory($id: ID!) {
      employee(id: $id) { id }
      recordHistory(recordType: EMPLOYEE, recordId: $id, first: 10) {
        edges { node { operation changes { field oldValue newValue } } }
      }
    }
  `,
    { id },
  );
  expect(history.status).toBe(200);
  expect(await history.json()).toEqual({
    data: {
      employee: null,
      recordHistory: {
        edges: [
          {
            node: {
              operation: "DELETED",
              changes: [
                { field: "firstName", oldValue: "Avery", newValue: null },
                { field: "lastName", oldValue: "Stone", newValue: null },
                { field: "email", oldValue: "avery@example.com", newValue: null },
              ],
            },
          },
          {
            node: {
              operation: "CREATED",
              changes: [
                { field: "firstName", oldValue: null, newValue: "Avery" },
                { field: "lastName", oldValue: null, newValue: "Stone" },
                { field: "email", oldValue: null, newValue: "avery@example.com" },
              ],
            },
          },
        ],
      },
    },
  });
});
