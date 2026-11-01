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
