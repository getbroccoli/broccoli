import {
  approveReviewedImport,
  copyInvite,
  createBrowser,
  expect,
  MANAGED_ASSIGNMENT,
  signInAsManagedOwner,
  startManagedEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("a managed invitee can sign out and sign in again with their password", async () => {
  const { env, accounts } = await startManagedEnv();
  const owner = await signInAsManagedOwner(env, accounts);
  expect(
    await (
      await owner.graphql(
        `mutation { company { update(input: { name: "Acme Corp" }) { error { __typename } } } }`,
      )
    ).json(),
  ).toMatchObject({ data: { company: { update: { error: null } } } });
  expect(await (await approveReviewedImport(owner)).json()).toMatchObject({
    data: { import: { approve: { error: null } } },
  });
  expect(
    await (await owner.graphql("mutation { setup { complete { setup { step } } } }")).json(),
  ).toMatchObject({ data: { setup: { complete: { setup: { step: "DONE" } } } } });
  const employee = await env.seed.employee();
  const token = await copyInvite(owner, employee.id);
  const browser = createBrowser(env.url, MANAGED_ASSIGNMENT.publicOrigin);
  expect(
    (await browser.post("/api/auth/invite/accept", { token, password: TEST_OWNER.password }))
      .status,
  ).toBe(200);
  expect((await browser.post("/api/auth/sign-out", {})).status).toBe(200);
  expect(await (await browser.get("/api/auth/get-session")).json()).toBeNull();

  const response = await browser.post("/api/auth/sign-in/email", {
    email: employee.email,
    password: TEST_OWNER.password,
  });

  expect(response.status).toBe(200);
  expect(await (await browser.graphql("query { me { employee { id } } }")).json()).toEqual({
    data: { me: { employee: { id: employee.id } } },
  });
});
