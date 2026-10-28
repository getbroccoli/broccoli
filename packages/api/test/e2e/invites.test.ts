import {
  approveReviewedImport,
  CANCEL_INVITE,
  copyInvite,
  createBrowser,
  expect,
  INVITE_EMPLOYEES,
  MANAGED_ASSIGNMENT,
  RESEND_CHOICE,
  SAVE_MAIL_SETTINGS,
  signInAsManagedOwner,
  startMailTestEnv,
  startManagedEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("an emailed invite signs the person in as their employee and records who joined", async () => {
  const { env, owner, resend } = await startMailTestEnv();
  expect(
    await (await owner.graphql(SAVE_MAIL_SETTINGS, { input: RESEND_CHOICE })).json(),
  ).toMatchObject({ data: { setup: { saveMailSettings: { error: null } } } });
  await env.changeUserName(TEST_OWNER.email, "Robin Reed");
  const employee = await env.seed.employee({ firstName: "Avery", email: "avery@example.com" });
  const browser = env.browser();
  expect(
    await (await owner.graphql("query { me { employee { id } } setup { inviteDelivery } }")).json(),
  ).toEqual({ data: { me: { employee: null }, setup: { inviteDelivery: "SENT_BY_EMAIL" } } });

  const response = await owner.graphql(INVITE_EMPLOYEES, { input: { employeeIds: [employee.id] } });

  expect(await response.json()).toMatchObject({
    data: {
      employee: {
        invite: {
          error: null,
          invites: [
            {
              employee: {
                id: employee.id,
                signInStatus: { state: "PENDING", notSent: false, emailHasAccount: false },
              },
              delivery: "SENT_BY_EMAIL",
              link: null,
            },
          ],
        },
      },
    },
  });
  await expect.poll(() => resend.emails.length, { timeout: 15_000 }).toBe(1);
  expect(resend.emails[0]!.body.to).toEqual([employee.email]);
  const link = new URL(resend.emails[0]!.body.text.match(/https?:\/\/\S+/)![0]);
  expect(link.origin).toBe(env.url);
  expect(link.pathname).toBe("/invite");
  const token = link.hash.slice(1);
  const lookup = await browser.post("/api/auth/invite/lookup", { token });
  expect(lookup.status).toBe(200);
  expect(await lookup.json()).toMatchObject({
    companyName: "Acme Corp",
    inviterFirstName: "Robin",
    firstName: "Avery",
    email: employee.email,
    expiresAt: expect.any(String) as unknown,
  });
  const accepted = await browser.post("/api/auth/invite/accept", {
    token,
    password: TEST_OWNER.password,
  });
  expect(accepted.status).toBe(200);
  expect(accepted.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringContaining("session_token=")]),
  );
  const session = (await (await browser.get("/api/auth/get-session")).json()) as {
    user: { id: string; email: string };
  };
  expect(session.user.email).toBe(employee.email);
  expect(
    await (
      await browser.graphql("query { me { employee { id email } permissionProfiles } }")
    ).json(),
  ).toEqual({
    data: {
      me: {
        employee: { id: employee.id, email: employee.email },
        permissionProfiles: ["EMPLOYEE"],
      },
    },
  });
  const history = await owner.graphql(
    `query History($id: ID!) {
    employee(id: $id) { history { edges { node { cause { kind } author { kind userId } } } } }
  }`,
    { id: employee.id },
  );
  expect(await history.json()).toMatchObject({
    data: {
      employee: {
        history: {
          edges: [
            {
              node: {
                cause: { kind: "INVITE_ACCEPTED" },
                author: { kind: "SIGNED_IN_USER", userId: session.user.id },
              },
            },
            { node: { cause: { kind: "INVITE_SENT" } } },
          ],
        },
      },
    },
  });
});

test("a copied invite without email gives the person the chosen admin profile", async ({ env }) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const employee = await env.seed.employee();
  expect(await (await owner.graphql("query { setup { inviteDelivery } }")).json()).toEqual({
    data: { setup: { inviteDelivery: "COPIED_BY_OWNER" } },
  });
  const token = await copyInvite(owner, employee.id, ["ADMIN"]);
  const browser = env.browser();

  const response = await browser.post("/api/auth/invite/accept", {
    token,
    password: TEST_OWNER.password,
  });

  expect(response.status).toBe(200);
  expect(
    await (await browser.graphql("query { me { employee { id } permissionProfiles } }")).json(),
  ).toEqual({
    data: { me: { employee: { id: employee.id }, permissionProfiles: ["EMPLOYEE", "ADMIN"] } },
  });
});

test("accepting one link twice at once creates exactly one user", async ({ env }) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const employee = await env.seed.employee();
  const token = await copyInvite(owner, employee.id);

  const responses = await Promise.all([
    env.browser().post("/api/auth/invite/accept", { token, password: TEST_OWNER.password }),
    env.browser().post("/api/auth/invite/accept", { token, password: TEST_OWNER.password }),
  ]);

  expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
  expect(await responses.find(({ status }) => status === 400)!.json()).toMatchObject({
    code: "INVITE_LINK_INVALID",
  });
  expect(await env.userIdsForEmail(employee.email)).toHaveLength(1);
});

test("used, cancelled, replaced and unknown tokens have the same lookup and accept error", async ({
  env,
}) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const [joined, cancelled, replaced] = await env.seed.employees(3);
  const usedToken = await copyInvite(owner, joined!.id);
  expect(
    (
      await env
        .browser()
        .post("/api/auth/invite/accept", { token: usedToken, password: TEST_OWNER.password })
    ).status,
  ).toBe(200);
  const cancelledToken = await copyInvite(owner, cancelled!.id);
  const cancelledResponse = await owner.graphql(CANCEL_INVITE, {
    input: { employeeId: cancelled!.id },
  });
  expect(await cancelledResponse.json()).toEqual({
    data: {
      employee: {
        cancelInvite: {
          employee: { id: cancelled!.id, signInStatus: { state: "NOT_INVITED" } },
          error: null,
        },
      },
    },
  });
  const replacedToken = await copyInvite(owner, replaced!.id);
  await copyInvite(owner, replaced!.id);
  const browser = env.browser();
  const bodies: unknown[] = [];

  for (const token of [usedToken, cancelledToken, replacedToken, "x".repeat(43)]) {
    for (const path of ["/api/auth/invite/lookup", "/api/auth/invite/accept"]) {
      const response = await browser.post(path, { token, password: TEST_OWNER.password });
      expect(response.status).toBe(400);
      bodies.push(await response.json());
    }
  }

  expect(bodies).toHaveLength(8);
  for (const body of bodies) {
    expect(body).toMatchObject({ code: "INVITE_LINK_INVALID" });
    expect(body).toEqual(bodies[0]);
  }
});

test("a person deleted after being invited cannot accept the link", async ({ env }) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const employee = await env.seed.employee();
  const token = await copyInvite(owner, employee.id);
  const removed = await owner.graphql(
    `mutation Delete($input: EmployeeDeleteInput!) {
    employee { delete(input: $input) { deletedEmployeeId error { __typename } } }
  }`,
    { input: { id: employee.id } },
  );
  expect(await removed.json()).toEqual({
    data: { employee: { delete: { deletedEmployeeId: employee.id, error: null } } },
  });

  const response = await env
    .browser()
    .post("/api/auth/invite/accept", { token, password: TEST_OWNER.password });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVITE_LINK_INVALID" });
});

test("a short password is refused without consuming the invite", async ({ env }) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const employee = await env.seed.employee();
  const token = await copyInvite(owner, employee.id);
  const browser = env.browser();

  const refused = await browser.post("/api/auth/invite/accept", { token, password: "1234567" });

  expect(refused.status).toBe(400);
  expect(
    (await browser.post("/api/auth/invite/accept", { token, password: TEST_OWNER.password }))
      .status,
  ).toBe(200);
});

test("the twenty-first invite lookup in a minute is rate limited", async ({ env }) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const employee = await env.seed.employee();
  const token = await copyInvite(owner, employee.id);
  const browser = env.browser();

  for (let request = 0; request < 20; request++) {
    expect((await browser.post("/api/auth/invite/lookup", { token })).status).toBe(200);
  }
  const limited = await browser.post("/api/auth/invite/lookup", { token });

  expect(limited.status).toBe(429);
});

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

test("an employee who joined cannot invite another person", async ({ env }) => {
  const { browser: owner } = await env.signInAsOwner();
  await env.seed.setupStep("done");
  const [employee, colleague] = await env.seed.employees(2);
  const token = await copyInvite(owner, employee!.id);
  const browser = env.browser();
  expect(
    (await browser.post("/api/auth/invite/accept", { token, password: TEST_OWNER.password }))
      .status,
  ).toBe(200);

  const response = await browser.graphql(INVITE_EMPLOYEES, {
    input: { employeeIds: [colleague!.id] },
  });

  expect(await response.json()).toMatchObject({ errors: [{ extensions: { code: "FORBIDDEN" } }] });
});
