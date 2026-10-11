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
    employee { create(input: $input) { id firstName lastName email jobTitle startDate createdAt } }
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
    data: { employee: { create: { id: string; createdAt: string } } };
  };

  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("errors");
  const employee = body.data.employee.create;
  expect(employee).toMatchObject(input);
  expect(employee.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  expect(employee.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
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
