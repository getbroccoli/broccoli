import { expect, test } from "#test/support";

test("returns visible manager references and their hidden flags through record history", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee();
  const previousManager = await env.seed.employee({ firstName: "Robin", lastName: "Reed" });
  const nextManager = await env.seed.employee({ firstName: "Taylor", lastName: "Brook" });
  await env.seed.manager(employee.id, previousManager.id);
  const updated = await browser.graphql(
    `mutation UpdateEmployee($input: EmployeeUpdateInput!) {
      employee { update(input: $input) {
        employee { id }
        error { __typename ... on Error { message } }
      } }
    }`,
    { input: { id: employee.id, managerId: nextManager.id } },
  );
  expect(await updated.json()).toEqual({
    data: { employee: { update: { employee: { id: employee.id }, error: null } } },
  });

  const response = await browser.graphql(
    `query RecordHistory($id: ID!) {
      recordHistory(recordType: EMPLOYEE, recordId: $id) {
        edges { node { changes { field oldValue newValue oldLabel newLabel oldHidden newHidden } } }
      }
    }`,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      recordHistory: {
        edges: [
          {
            node: {
              changes: [
                {
                  field: "manager",
                  oldValue: previousManager.id,
                  newValue: nextManager.id,
                  oldLabel: "Robin Reed",
                  newLabel: "Taylor Brook",
                  oldHidden: false,
                  newHidden: false,
                },
              ],
            },
          },
        ],
      },
    },
  });
});
