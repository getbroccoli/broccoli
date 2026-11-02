import { expect, test, TEST_OWNER } from "#test/support";

test("identifies the unlinked workspace owner through GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee({ email: TEST_OWNER.email });

  const response = await browser.graphql(query, { id: employee.id });

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        signInStatus: { state: "NOT_INVITED", isWorkspaceOwner: true, canBeInvited: false },
      },
    },
  });
});

test.for([true, false])(
  "keeps owner visibility within invite access (admin: %s)",
  async (isAdmin, { env }) => {
    await env.seed.owner();
    const employee = await env.seed.employee({ email: TEST_OWNER.email });
    const credentials = { email: "colleague@example.com", password: TEST_OWNER.password };
    const user = await env.seed.user({
      ...credentials,
      permissionProfiles: isAdmin ? ["ADMIN"] : [],
    });
    await env.seed.employee({ userId: user.id, email: user.email });
    const { browser } = await env.signIn(credentials);

    const response = await browser.graphql(query, { id: employee.id });

    expect(await response.json()).toEqual({
      data: {
        employee: {
          id: employee.id,
          signInStatus: isAdmin
            ? { state: "NOT_INVITED", isWorkspaceOwner: true, canBeInvited: false }
            : null,
        },
      },
    });
  },
);

const query = `query EmployeeSignIn($id: ID!) {
  employee(id: $id) { id signInStatus { state isWorkspaceOwner canBeInvited } }
}`;
