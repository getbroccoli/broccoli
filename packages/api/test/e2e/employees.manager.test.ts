import { expect, test } from "#test/support";

test("sets several employees' manager through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const avery = await env.seed.employee();
  const taylor = await env.seed.employee();
  const robin = await env.seed.employee();

  const response = await browser.graphql(
    `mutation SetManagers($input: EmployeeSetManagersInput!) {
    employee { setManagers(input: $input) {
      employees { id manager { id } }
      error { __typename ... on Error { message } }
    } }
  }`,
    { input: { employeeIds: [avery.id, taylor.id], managerId: robin.id } },
  );

  const body = await response.json();
  expect(body).not.toHaveProperty("errors");
  expect(body).toMatchObject({
    data: {
      employee: {
        setManagers: {
          error: null,
          employees: expect.arrayContaining([
            { id: avery.id, manager: { id: robin.id } },
            { id: taylor.id, manager: { id: robin.id } },
          ]) as unknown,
        },
      },
    },
  });
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
