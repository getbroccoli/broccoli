import { connectAndReadSlack, expect, slackAuthorization, slackTest as test } from "#test/support";

test("connecting redirects the owner to the relay with an OAuth cookie and callback URL", async ({
  env,
  slack,
}) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.getManual("/api/integrations/slack/connect");

  expect(response.status).toBe(302);
  const { cookie, authorizeUrl } = slackAuthorization(response);
  expect(cookie).toContain("Path=/api/integrations/slack");
  expect(cookie).toContain("Max-Age=600");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(authorizeUrl.origin).toBe(slack.url);
  expect(authorizeUrl.pathname).toBe("/slack/authorize");
  expect(authorizeUrl.searchParams.get("return_to")).toBe(
    `${env.url}/api/integrations/slack/callback`,
  );
});

test("connecting saves the workspace and an explicit read imports all Slack pages", async ({
  env,
  slack,
}) => {
  slack.pages[0] = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
  ];
  slack.pages.push([
    { id: "U2", profile: { first_name: "Robin", last_name: "Reed", email: "robin@example.com" } },
  ]);
  const { browser } = await env.signInAsOwner();
  const { state } = slackAuthorization(await browser.getManual("/api/integrations/slack/connect"));

  const callback = await browser.getManual(
    `/api/integrations/slack/callback?${new URLSearchParams({ state, handle: "test-handle" }).toString()}`,
  );

  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/setup/import");
  expect(callback.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^broccoli_slack_oauth=.*Max-Age=0/)]),
  );
  const redemption = slack.requests.find(({ path }) => path === "/slack/redeem");
  expect(redemption).toMatchObject({
    method: "POST",
    body: { handle: "test-handle" },
  });
  expect(slack.requests.filter(({ path }) => path.startsWith("/users.list"))).toEqual([]);
  const connection = await browser.graphql(`query {
    slackConnection { id workspaceName }
    import { sources { name } }
  }`);
  expect(await connection.json()).toEqual({
    data: {
      slackConnection: { id: "slack", workspaceName: "Acme Workspace" },
      import: { sources: [] },
    },
  });
  const imported = await browser.graphql("mutation { import { readSlack { id } } }");
  expect(await imported.json()).toEqual({ data: { import: { readSlack: { id: "import" } } } });
  const reads = slack.requests.filter(({ path }) => path.startsWith("/users.list"));
  expect(reads).toHaveLength(2);
  for (const request of reads) {
    expect(request.method).toBe("GET");
    expect(request.authorization).toBe("Bearer test-slack-token");
    expect(new URL(request.path, slack.url).searchParams.get("limit")).toBe("200");
  }
  expect(new URL(reads[1]!.path, slack.url).searchParams.get("cursor")).toBe("1");
  const response = await browser.graphql(`query {
    import {
      id
      sources { kind name employeeCount employees { edges { node { firstName } } } }
      employees { edges { node { firstName email source { name } } } }
    }
  }`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: {
      import: {
        id: "import",
        sources: [
          {
            kind: "SLACK",
            name: "Acme Workspace",
            employeeCount: 2,
            employees: {
              edges: [{ node: { firstName: "Avery" } }, { node: { firstName: "Robin" } }],
            },
          },
        ],
        employees: {
          edges: [
            {
              node: {
                firstName: "Avery",
                email: "avery@example.com",
                source: { name: "Acme Workspace" },
              },
            },
            {
              node: {
                firstName: "Robin",
                email: "robin@example.com",
                source: { name: "Acme Workspace" },
              },
            },
          ],
        },
      },
    },
  });
});

test("a mismatched callback state redirects with an error without redeeming", async ({
  env,
  slack,
}) => {
  const { browser } = await env.signInAsOwner();
  await browser.getManual("/api/integrations/slack/connect");

  const response = await browser.getManual(
    "/api/integrations/slack/callback?state=wrong-state&handle=test-handle",
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/setup/import?slackError=state");
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^broccoli_slack_oauth=.*Max-Age=0/)]),
  );
  expect(slack.requests).toEqual([]);
});

test("declining Slack authorization redirects with the cancelled error", async ({ env, slack }) => {
  const { browser } = await env.signInAsOwner();
  const { state } = slackAuthorization(await browser.getManual("/api/integrations/slack/connect"));

  const response = await browser.getManual(
    `/api/integrations/slack/callback?${new URLSearchParams({ state, error: "access_denied" }).toString()}`,
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/setup/import?slackError=cancelled");
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^broccoli_slack_oauth=.*Max-Age=0/)]),
  );
  expect(slack.requests).toEqual([]);
});

test("refresh returns the updated import and skipping completes setup", async ({ env, slack }) => {
  const { browser } = await env.signInAsOwner();
  await browser.graphql('mutation { company { update(input: { name: "Acme Corp" }) { id } } }');
  await connectAndReadSlack(browser);
  slack.pages[0] = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
  ];

  const refreshed = await browser.graphql(`mutation {
    import { readSlack { id sources { employeeCount } employees { edges { node { email } } } } }
  }`);

  expect(await refreshed.json()).toEqual({
    data: {
      import: {
        readSlack: {
          id: "import",
          sources: [{ employeeCount: 1 }],
          employees: { edges: [{ node: { email: "avery@example.com" } }] },
        },
      },
    },
  });

  const skipped = await browser.graphql("mutation { import { skip { id } } }");

  expect(await skipped.json()).toEqual({ data: { import: { skip: { id: "import" } } } });
  const setup = await browser.graphql("query { setup { step } }");
  expect(await setup.json()).toEqual({ data: { setup: { step: "DONE" } } });
});

test("a malformed Slack response refuses refresh and preserves the imported employees", async ({
  env,
  slack,
}) => {
  slack.pages[0] = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
  ];
  const { browser } = await env.signInAsOwner();
  await connectAndReadSlack(browser);
  slack.replyToNextUsersList({ ok: true });

  const refreshed = await browser.graphql("mutation { import { readSlack { id } } }");

  expect(await refreshed.json()).toMatchObject({
    errors: [{ message: "Could not read Slack.", extensions: { code: "UNAVAILABLE" } }],
  });
  const employees = await browser.graphql(
    "query { import { employees { edges { node { firstName email } } } } }",
  );
  expect(await employees.json()).toEqual({
    data: {
      import: {
        employees: { edges: [{ node: { firstName: "Avery", email: "avery@example.com" } }] },
      },
    },
  });
});

test("connecting without a session is refused", async ({ env, slack }) => {
  const response = await env.browser().getManual("/api/integrations/slack/connect");

  expect(response.status).toBe(401);
  expect(slack.requests).toEqual([]);
});

test("a callback after signing out redirects with state and clears the OAuth cookie", async ({
  env,
  slack,
}) => {
  const { browser } = await env.signInAsOwner();
  const { state } = slackAuthorization(await browser.getManual("/api/integrations/slack/connect"));
  await browser.post("/api/auth/sign-out", {});

  const response = await browser.getManual(
    `/api/integrations/slack/callback?${new URLSearchParams({ state, handle: "test-handle" }).toString()}`,
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/setup/import?slackError=state");
  expect(response.headers.getSetCookie()).toEqual(
    expect.arrayContaining([expect.stringMatching(/^broccoli_slack_oauth=.*Max-Age=0/)]),
  );
  expect(slack.requests).toEqual([]);
});

test("approving creates the Slack members as employees once and completes setup", async ({
  env,
  slack,
}) => {
  slack.pages[0] = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
    { id: "U2", profile: { first_name: "Robin", last_name: "Reed", email: "robin@example.com" } },
  ];
  const { browser } = await env.signInAsOwner();
  await browser.graphql('mutation { company { update(input: { name: "Acme Corp" }) { id } } }');
  await connectAndReadSlack(browser);
  const approve = "mutation { import { approve { id } } }";
  const people = `query {
    employees(orderBy: { field: EMAIL, direction: ASC }) { edges { node { firstName lastName email } } }
    setup { step }
  }`;

  expect(await (await browser.graphql(approve)).json()).toEqual(APPROVED);
  const approved: unknown = await (await browser.graphql(people)).json();
  expect(await (await browser.graphql(approve)).json()).toEqual(APPROVED);

  expect(approved).toEqual({
    data: {
      employees: {
        edges: [
          { node: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" } },
          { node: { firstName: "Robin", lastName: "Reed", email: "robin@example.com" } },
        ],
      },
      setup: { step: "DONE" },
    },
  });
  expect(await (await browser.graphql(people)).json()).toEqual(approved);
});

test("review counts only complete Slack members and Approve adds exactly those members", async ({
  env,
  slack,
}) => {
  slack.pages[0] = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
    { id: "U2", profile: { real_name: "Morgan", email: "morgan@example.com" } },
    { id: "U3", profile: { first_name: "Robin", last_name: "Reed", email: "robin@example.com" } },
  ];
  const { browser } = await env.signInAsOwner();
  await browser.graphql('mutation { company { update(input: { name: "Acme Corp" }) { id } } }');
  await connectAndReadSlack(browser);

  const review = await browser.graphql(`query {
    import {
      readyEmployeeCount
      employees(first: 100) { edges { node { email incompleteReason } } }
    }
  }`);
  const reviewed: unknown = await review.json();

  expect(reviewed).toEqual({
    data: {
      import: {
        readyEmployeeCount: 2,
        employees: {
          edges: [
            { node: { email: "avery@example.com", incompleteReason: null } },
            { node: { email: "morgan@example.com", incompleteReason: "LAST_NAME" } },
            { node: { email: "robin@example.com", incompleteReason: null } },
          ],
        },
      },
    },
  });

  const approved = await browser.graphql("mutation { import { approve { id } } }");
  expect(await approved.json()).toEqual(APPROVED);
  const people = await browser.graphql(`query {
    employees(first: 100, orderBy: { field: EMAIL, direction: ASC }) { edges { node { email } } }
  }`);
  expect(await people.json()).toEqual({
    data: {
      employees: {
        edges: [{ node: { email: "avery@example.com" } }, { node: { email: "robin@example.com" } }],
      },
    },
  });
});

const APPROVED = { data: { import: { approve: { id: "import" } } } };
