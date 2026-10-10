import { createEmployee, expect, test } from "./support";

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

test("creates an employee and returns it normalised", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const employee = await createEmployee(browser, {
    firstName: "  Employee  ",
    lastName: "  One  ",
    email: "  Employee.One@EXAMPLE.COM  ",
    jobTitle: "  Engineer  ",
    startDate: "2026-02-28",
  });

  expect(employee).toMatchObject({
    firstName: "Employee",
    lastName: "One",
    email: "employee.one@example.com",
    jobTitle: "Engineer",
    startDate: "2026-02-28",
  });
  expect(employee.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  expect(employee.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("lists employees in name order across pages", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const zoe = await createEmployee(browser, { firstName: "Zoe", lastName: "Adams" });
  const samZ = await createEmployee(browser, { firstName: "Sam", lastName: "Zimmer" });
  const ada = await createEmployee(browser, { firstName: "ada", lastName: "Stone" });
  const samA = await createEmployee(browser, { firstName: "sam", lastName: "adams" });
  const ben = await createEmployee(browser, { firstName: "Ben", lastName: "Young" });

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
  expect(secondPage.data.employees.edges.map((edge) => edge.node.id)).toEqual([samA.id, samZ.id]);
  expect(secondPage.data.employees.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: secondPage.data.employees.edges.at(-1)?.cursor,
  });

  const thirdResponse = await browser.graphql(listQuery, {
    first: 2,
    after: secondPage.data.employees.pageInfo.endCursor,
  });
  const thirdPage = (await thirdResponse.json()) as EmployeeListResponse;

  expect(thirdResponse.status).toBe(200);
  expect(thirdPage).not.toHaveProperty("errors");
  expect(thirdPage.data.employees.edges.map((edge) => edge.node.id)).toEqual([zoe.id]);
  expect(thirdPage.data.employees.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: thirdPage.data.employees.edges.at(-1)?.cursor,
  });
});

test("pages stably through employees with the same name", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const firstSam = await createEmployee(browser, { firstName: "Sam", lastName: "Lee" });
  const secondSam = await createEmployee(browser, { firstName: "Sam", lastName: "Lee" });
  const [firstId, secondId] = [firstSam.id, secondSam.id].sort();

  const firstResponse = await browser.graphql(listQuery, { first: 1 });
  const firstPage = (await firstResponse.json()) as EmployeeListResponse;

  expect(firstResponse.status).toBe(200);
  expect(firstPage).not.toHaveProperty("errors");
  expect(firstPage.data.employees.edges.map((edge) => edge.node.id)).toEqual([firstId]);
  expect(firstPage.data.employees.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.data.employees.edges.at(-1)?.cursor,
  });

  const secondResponse = await browser.graphql(listQuery, {
    first: 1,
    after: firstPage.data.employees.pageInfo.endCursor,
  });
  const secondPage = (await secondResponse.json()) as EmployeeListResponse;

  expect(secondResponse.status).toBe(200);
  expect(secondPage).not.toHaveProperty("errors");
  expect(secondPage.data.employees.edges.map((edge) => edge.node.id)).toEqual([secondId]);
  expect(secondPage.data.employees.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: secondPage.data.employees.edges.at(-1)?.cursor,
  });
});

test("refuses an email that differs only in case", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await createEmployee(browser, { email: "employee.one@example.com" });

  const response = await browser.graphql(createMutation, {
    input: { firstName: "Employee", lastName: "Two", email: "EMPLOYEE.ONE@EXAMPLE.COM" },
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", {
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "email", code: "taken" }],
  });
});

test("refuses invalid input with one field error per field", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql(createMutation, {
    input: { firstName: "   ", lastName: "One", email: "not-an-email" },
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions.code", "INVALID_INPUT");
  expect(body).toHaveProperty(
    "errors.0.extensions.fieldErrors",
    expect.arrayContaining([
      { field: "firstName", code: "required" },
      { field: "email", code: "invalid" },
    ]),
  );
  expect(body).toHaveProperty("errors.0.extensions.fieldErrors.length", 2);
});

test("refuses a page size greater than 10000", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql(listQuery, { first: 10001 });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", {
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "first", code: "out_of_range" }],
  });
});

test("refuses a malformed cursor", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.graphql(listQuery, { first: 2, after: "not-a-cursor" });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", {
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "after", code: "invalid" }],
  });
});

test("refuses the query without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql(listQuery, { first: 2 });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", { code: "UNAUTHENTICATED", fieldErrors: [] });
});

test("refuses the mutation without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().graphql(createMutation, {
    input: { firstName: "Employee", lastName: "One", email: "employee.one@example.com" },
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("errors.0.extensions", { code: "UNAUTHENTICATED", fieldErrors: [] });
});
