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

test("sets a person's manager through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ firstName: "Avery", lastName: "Stone" });
  const manager = await env.seed.employee({ firstName: "Robin", lastName: "Reed" });

  const updated = await browser.graphql(
    `mutation UpdateEmployee($input: EmployeeUpdateInput!) {
      employee { update(input: $input) {
        employee { id }
        error { __typename ... on Error { message } }
      } }
    }`,
    { input: { id: employee.id, managerId: manager.id } },
  );

  expect(await updated.json()).toEqual({
    data: { employee: { update: { employee: { id: employee.id }, error: null } } },
  });
  const response = await browser.graphql(
    `query Employee($id: ID!) {
      employee(id: $id) { id managerId manager { id firstName } }
    }`,
    { id: employee.id },
  );
  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        managerId: manager.id,
        manager: { id: manager.id, firstName: "Robin" },
      },
    },
  });
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

test("employee history resolves the session author, cause and UTC time", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const employee = await env.seed.employee({ jobTitle: "Engineer" });
  const updated = await browser.graphql(
    `
    mutation UpdateEmployee($input: EmployeeUpdateInput!) {
      employee { update(input: $input) {
        employee { id }
        historyLine { id operation changes { field oldValue newValue } }
        error { __typename ... on Error { message } }
      } }
    }
  `,
    { input: { id: employee.id, jobTitle: "Lead" } },
  );

  const body = (await updated.json()) as {
    data: { employee: { update: { historyLine: { id: string } } } };
  };
  expect(body).toEqual({
    data: {
      employee: {
        update: {
          employee: { id: employee.id },
          historyLine: {
            id: expect.any(String) as unknown,
            operation: "UPDATED",
            changes: [{ field: "jobTitle", oldValue: "Engineer", newValue: "Lead" }],
          },
          error: null,
        },
      },
    },
  });

  const response = await browser.graphql(
    `
    query EmployeeHistory($id: ID!) {
      employee(id: $id) { id history(first: 10) {
        edges { node { id occurredAt author { kind userId email } cause { kind } } }
      } }
    }
  `,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        history: {
          edges: [
            {
              node: {
                id: body.data.employee.update.historyLine.id,
                occurredAt: expect.stringMatching(
                  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
                ) as unknown,
                author: { kind: "SIGNED_IN_USER", userId: user.id, email: user.email },
                cause: { kind: "EDITED_DIRECTLY" },
              },
            },
          ],
        },
      },
    },
  });
});

test("record history links each line to its employee", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const created = await browser.graphql(createMutation, {
    input: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  });
  const body = (await created.json()) as {
    data: { employee: { create: { employee: { id: string } } } };
  };
  const { id } = body.data.employee.create.employee;

  const response = await browser.graphql(
    `
    query RecordHistory($id: ID!) {
      recordHistory(recordType: EMPLOYEE, recordId: $id) {
        edges { node { record { __typename ... on Employee { id firstName } } } }
      }
    }
  `,
    { id },
  );

  expect(await response.json()).toEqual({
    data: {
      recordHistory: {
        edges: [{ node: { record: { __typename: "Employee", id, firstName: "Avery" } } }],
      },
    },
  });
});

test("deleting an employee keeps history with no linked record", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const created = await browser.graphql(createMutation, {
    input: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  });
  const body = (await created.json()) as {
    data: { employee: { create: { employee: { id: string } } } };
  };
  const { id } = body.data.employee.create.employee;
  await browser.graphql(
    `
    mutation DeleteEmployee($input: EmployeeDeleteInput!) {
      employee { delete(input: $input) {
        deletedEmployeeId error { __typename ... on Error { message } }
      } }
    }
  `,
    { input: { id } },
  );

  const history = await browser.graphql(
    `
    query DeletedEmployeeHistory($id: ID!) {
      employee(id: $id) { id }
      recordHistory(recordType: EMPLOYEE, recordId: $id) {
        edges { node { operation record { __typename ... on Employee { id firstName } } } }
      }
    }
  `,
    { id },
  );

  expect(await history.json()).toEqual({
    data: {
      employee: null,
      recordHistory: {
        edges: [
          { node: { operation: "DELETED", record: null } },
          { node: { operation: "CREATED", record: null } },
        ],
      },
    },
  });
});
