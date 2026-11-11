import {
  approveReviewedImport,
  assignedManagedEnv,
  expect,
  MANAGED_ASSIGNMENT,
  managedOptions,
  managedTicketClaims,
  postManagedTicket,
  sessionCookieOf,
  startManagedEnv,
  startManagedSignIn,
  signInAsManagedOwner,
  TestEnv,
  test,
} from "#test/support";

const { publicOrigin, websiteOrigin, companyId } = MANAGED_ASSIGNMENT;

const SIGN_IN_REQUIRED = `${publicOrigin}/login?error=sign_in_required`;

test.each(["google", "email"])(
  "start sets the state cookie and forwards method %s to the website",
  async (method) => {
    const { env } = await assignedManagedEnv();

    const { state, location, cookie } = await startManagedSignIn(env, `?method=${method}`);

    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/;\s*Path=\/(?:;|$)/i);
    expect(cookie).toMatch(/;\s*Max-Age=300(?:;|$)/i);
    expect(cookie).not.toMatch(/;\s*Domain=/i);
    expect(location.origin + location.pathname).toBe(`${websiteOrigin}/api/auth/managed/entry`);
    expect(Object.fromEntries(location.searchParams)).toEqual({
      company: companyId,
      state,
      method,
    });
  },
);

test("start drops an unknown method", async () => {
  const { env } = await assignedManagedEnv();

  const { location } = await startManagedSignIn(env, "?method=password");

  expect(location.searchParams.has("method")).toBe(false);
});

test("the first ticket creates the owner and signs them in", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);

  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(state)),
    state,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`${publicOrigin}/`);
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^__Host-managed_state=;.*Max-Age=0/i)]),
  );
  const cookie = sessionCookieOf(response)!;
  expect(cookie).toBeDefined();
  expect((await me(env, cookie)).data).toEqual({
    me: { isOwner: true },
    setup: { step: "COMPANY", mode: "MANAGED" },
  });
});

test.each([
  ["/api/auth/oauth2/authorize?client_id=x", "/api/auth/oauth2/authorize?client_id=x"],
  ["https://elsewhere.example/", "/"],
  ["//elsewhere.example", "/"],
])("managed sign-in asked to return to %s lands on %s", async (redirect, landing) => {
  const { env, accounts } = await assignedManagedEnv();
  const { state, returnCookie } = await startManagedSignIn(
    env,
    `?method=email&redirect=${encodeURIComponent(redirect)}`,
  );

  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(state, { method: "email" })),
    state,
    websiteOrigin,
    returnCookie ? [returnCookie] : [],
  );

  expect(sessionCookieOf(response)).toBeDefined();
  expect(response.headers.get("location")).toBe(`${publicOrigin}${landing}`);
});

test("exposes the email owner's sign-in method without a session", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);
  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(state, { method: "email" })),
    state,
  );
  expect(sessionCookieOf(response)).toBeDefined();

  const setup = await env.browser().graphql("{ setup { ownerSignInMethod } }");

  expect(await setup.json()).toEqual({
    data: { setup: { ownerSignInMethod: "SIGN_IN_WITH_EMAIL" } },
  });
});

test("a managed owner completes setup from the ready step over GraphQL", async () => {
  const { env, accounts } = await startManagedEnv();
  const browser = await signInAsManagedOwner(env, accounts);
  await browser.graphql(`mutation {
    company { update(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } }
  }`);
  const approval = await approveReviewedImport(browser);
  expect(await approval.json()).toEqual({
    data: { imports: { approve: { import: { id: "import" }, error: null } } },
  });
  const ready = await browser.graphql("query { setup { id step } }");
  expect(await ready.json()).toEqual({
    data: { setup: { id: "instance", step: "READY" } },
  });

  const response = await browser.graphql(
    "mutation { system { completeSetup { setup { id step } } } }",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { system: { completeSetup: { setup: { id: "instance", step: "DONE" } } } },
  });
  const setup = await browser.graphql("query { setup { id step } }");
  expect(await setup.json()).toEqual({
    data: { setup: { id: "instance", step: "DONE" } },
  });
});

test("completing managed setup returns the invites for everyone", async () => {
  const { env, accounts } = await startManagedEnv();
  const browser = await signInAsManagedOwner(env, accounts);
  await browser.graphql(`mutation {
    company { update(input: { name: "Acme Corp" }) { company { id } error { __typename } } }
  }`);
  const source = await env.seed.importSource();
  await env.seed.importEmployees(source.id, [
    { firstName: "Robin", lastName: "Reed", email: "robin@example.com" },
  ]);
  expect(await (await approveReviewedImport(browser)).json()).toMatchObject({
    data: { imports: { approve: { error: null } } },
  });

  const response = await browser.graphql(`mutation {
    system { completeSetup(input: { inviteAudience: EVERYONE }) {
      setup { id step }
      invites { employeeId name link }
      error { __typename ... on Error { message } }
    } }
  }`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: {
      system: {
        completeSetup: {
          setup: { id: "instance", step: "DONE" },
          invites: [{ employeeId: expect.any(String) as unknown, name: "Robin Reed", link: null }],
          error: null,
        },
      },
    },
  });
});

test("refuses a replayed ticket", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);
  const ticket = await accounts.signTicket(managedTicketClaims(state));
  await postManagedTicket(env, ticket, state);

  const replay = await postManagedTicket(env, ticket, state);

  expect(replay.status).toBe(303);
  expect(replay.headers.get("location")).toBe(SIGN_IN_REQUIRED);
  expect(sessionCookieOf(replay)).toBeUndefined();
  expect(replay.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^__Host-managed_state=;.*Max-Age=0/i)]),
  );
});

test("refuses a ticket for another audience", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);

  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(state), {
      audience: "https://other.example.com",
    }),
    state,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
  expect(sessionCookieOf(response)).toBeUndefined();
});

test("refuses an init token posted as a ticket", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);

  const response = await postManagedTicket(env, await accounts.signInit(), state);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
});

test.each([
  ["state", { state: "b".repeat(64) }],
  ["company", { company: "c-other" }],
])("refuses a ticket with the wrong %s", async (_claim, overrides) => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);

  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(state, overrides)),
    state,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
});

test("refuses a ticket without the state cookie", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);

  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(state)),
    null,
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
});

test.each(["https://evil.example.com", "https://www.example.com.evil.example.com", "null", null])(
  "refuses a ticket posted from origin %s",
  async (origin) => {
    const { env, accounts } = await assignedManagedEnv();
    const { state } = await startManagedSignIn(env);

    const response = await postManagedTicket(
      env,
      await accounts.signTicket(managedTicketClaims(state)),
      state,
      origin,
    );

    if (response.status === 303) {
      expect(response.headers.get("location")).toBe(SIGN_IN_REQUIRED);
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    expect(sessionCookieOf(response)).toBeUndefined();
  },
);

test("signs a returning owner in with a new ticket", async () => {
  const { env, accounts } = await startManagedEnv();
  await signInAsManagedOwner(env, accounts);

  const second = await startManagedSignIn(env);
  const response = await postManagedTicket(
    env,
    await accounts.signTicket(managedTicketClaims(second.state)),
    second.state,
  );

  expect((await me(env, sessionCookieOf(response)!)).data.me).toEqual({ isOwner: true });
});

test("redirects to sign-in unavailable when the issuer's keys cannot be read", async () => {
  const { env, accounts } = await assignedManagedEnv();
  const { state } = await startManagedSignIn(env);
  const ticket = await accounts.signTicket(managedTicketClaims(state));
  await env.restart(managedOptions(accounts));
  await accounts.stop();

  const response = await postManagedTicket(env, ticket, state);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`${publicOrigin}/login?error=sign_in_unavailable`);
  expect(sessionCookieOf(response)).toBeUndefined();
});

test.for(["/api/auth/setup", "/api/auth/setup/start"])(
  "has no self-hosted endpoint %s",
  async (path) => {
    const { env } = await assignedManagedEnv();

    const response = await fetch(`${env.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: publicOrigin },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  },
);

async function me(env: TestEnv, cookie: string) {
  const response = await fetch(`${env.url}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ query: "{ me { isOwner } setup { step mode } }" }),
  });
  return (await response.json()) as {
    data: { me: { isOwner: boolean } | null; setup: { step: string; mode: string } };
  };
}
