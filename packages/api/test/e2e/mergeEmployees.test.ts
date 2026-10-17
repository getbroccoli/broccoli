import {
  type Browser,
  connectAndReadSlack,
  expect,
  signInAsManagedOwner,
  slackTest as test,
  startManagedEnv,
} from "#test/support";

test("merges Slack and a CSV and approves one employee with the bulk-picked Slack job title", async ({
  slack,
  fakeDecisions,
}) => {
  slack.pages[0] = [
    {
      id: "U1",
      profile: {
        first_name: "Avery",
        last_name: "Stone",
        email: "avery@example.com",
        title: "Engineer",
      },
    },
  ];
  fakeDecisions.answer({ headerRow: "1", fullName: "A", email: "B", jobTitle: "C" });
  const { env, accounts } = await startManagedEnv({
    decisionsUrl: fakeDecisions.url,
    slack: { relayUrl: slack.url, apiUrl: slack.url },
  });
  const browser = await signInAsManagedOwner(env, accounts);
  await browser.graphql(SAVE_COMPANY);
  await connectAndReadSlack(browser);
  const upload = await browser.post(
    "/api/imports/files?name=staff.csv",
    Buffer.from("Name,Email,Job title\nAvery Stone,avery@example.com,Designer"),
  );
  expect(upload.status).toBe(200);
  const { sourceId: fileId } = (await upload.json()) as { sourceId: string };
  await waitForMapping(browser, fileId);

  const response = await browser.graphql(`query {
    import {
      id
      sources { id kind }
      checks { id kind count field reason sources { id name } }
      employees { edges { node {
        id records { id source { name } }
        jobTitle { value choice conflict options { value records { id source { name } } } }
      } } }
    }
  }`);
  const review = await response.json();
  expect(review).toMatchObject({
    data: {
      import: {
        employees: {
          edges: [
            {
              node: {
                id: "avery@example.com",
                records: [
                  { id: expect.any(String) as unknown, source: { name: "staff.csv" } },
                  { id: expect.any(String) as unknown, source: { name: "Acme Workspace" } },
                ],
                jobTitle: {
                  value: "Designer",
                  choice: "DEFAULT",
                  conflict: true,
                  options: [
                    {
                      value: "Designer",
                      records: [
                        { id: expect.any(String) as unknown, source: { name: "staff.csv" } },
                      ],
                    },
                    {
                      value: "Engineer",
                      records: [
                        { id: expect.any(String) as unknown, source: { name: "Acme Workspace" } },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  });
  const { data } = review as { data: { import: { sources: { id: string; kind: string }[] } } };
  const slackId = data.import.sources.find(({ kind }) => kind === "SLACK")!.id;
  expect(review).toMatchObject({
    data: {
      import: {
        checks: [
          {
            id: "conflict:jobTitle",
            kind: "CONFLICT",
            count: 1,
            field: "JOB_TITLE",
            reason: null,
            sources: [
              { id: fileId, name: "staff.csv" },
              { id: slackId, name: "Acme Workspace" },
            ],
          },
        ],
      },
    },
  });

  const picked = await browser.graphql(
    `mutation($sourceId: ID!) {
    import { chooseSourceForAll(field: JOB_TITLE, sourceId: $sourceId) { import { id } } }
  }`,
    { sourceId: slackId },
  );
  expect(await picked.json()).toEqual({
    data: { import: { chooseSourceForAll: { import: { id: "import" } } } },
  });
  expect(await (await browser.graphql(APPROVE)).json()).toEqual(APPROVED);
  expect(await (await browser.graphql(DIRECTORY)).json()).toEqual({
    data: {
      employees: {
        edges: [
          {
            node: {
              firstName: "Avery",
              lastName: "Stone",
              email: "avery@example.com",
              jobTitle: "Engineer",
            },
          },
        ],
      },
    },
  });
});

test("fixes a CSV row’s last name, leaves another row out and approves only the fixed employee", async ({
  fakeDecisions,
}) => {
  fakeDecisions.answer({ headerRow: "1", firstName: "A", lastName: "B", email: "C" });
  const { env, accounts } = await startManagedEnv({ decisionsUrl: fakeDecisions.url });
  const browser = await signInAsManagedOwner(env, accounts);
  await browser.graphql(SAVE_COMPANY);
  const upload = await browser.post(
    "/api/imports/files?name=staff.csv",
    Buffer.from("First name,Last name,Email\nAvery,,avery@example.com\nRobin,Reed,"),
  );
  expect(upload.status).toBe(200);
  const { sourceId } = (await upload.json()) as { sourceId: string };
  await waitForMapping(browser, sourceId);
  const review = await browser.graphql(
    `query { import { id employees { edges { node { id incompleteReason } } } } }`,
  );
  const { data } = (await review.json()) as {
    data: {
      import: { employees: { edges: { node: { id: string; incompleteReason: string } }[] } };
    };
  };
  const missingEmail = data.import.employees.edges.find(
    ({ node }) => node.incompleteReason === "EMAIL",
  )!.node.id;

  const fixed = await browser.graphql(`mutation {
    import { chooseEmployeeValue(input: { employeeId: "avery@example.com", field: LAST_NAME, value: "Stone" }) {
      import { id } error { __typename ... on InvalidInputError { fields { field code } } }
    } }
  }`);
  expect(await fixed.json()).toEqual({
    data: { import: { chooseEmployeeValue: { import: { id: "import" }, error: null } } },
  });
  const leftOut = await browser.graphql(
    `mutation($employeeId: ID!) {
    import { setEmployeeLeftOut(employeeId: $employeeId, leftOut: true) { import { id } } }
  }`,
    { employeeId: missingEmail },
  );
  expect(await leftOut.json()).toEqual({
    data: { import: { setEmployeeLeftOut: { import: { id: "import" } } } },
  });
  expect(await (await browser.graphql(APPROVE)).json()).toEqual(APPROVED);

  expect(await (await browser.graphql(DIRECTORY)).json()).toEqual({
    data: {
      employees: {
        edges: [
          {
            node: {
              firstName: "Avery",
              lastName: "Stone",
              email: "avery@example.com",
              jobTitle: null,
            },
          },
        ],
      },
    },
  });
});

test("returns a typed bad email as an InvalidInputError naming value", async ({ env, slack }) => {
  slack.pages[0] = [
    { id: "U1", profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" } },
  ];
  const { browser } = await env.signInAsOwner();
  await connectAndReadSlack(browser);

  const response = await browser.graphql(`mutation {
    import { chooseEmployeeValue(input: { employeeId: "avery@example.com", field: EMAIL, value: "avery@" }) {
      import { id } error { __typename ... on InvalidInputError { fields { field code } } }
    } }
  }`);

  expect(await response.json()).toEqual({
    data: {
      import: {
        chooseEmployeeValue: {
          import: null,
          error: { __typename: "InvalidInputError", fields: [{ field: "value", code: "invalid" }] },
        },
      },
    },
  });
});

const SAVE_COMPANY =
  'mutation { company { update(input: { name: "Acme Corp" }) { company { id } error { __typename } } } }';
const APPROVE =
  "mutation { import { approve { import { id } error { __typename ... on Error { message } } } } }";
const APPROVED = { data: { import: { approve: { import: { id: "import" }, error: null } } } };
const DIRECTORY =
  "query { employees(orderBy: { field: EMAIL, direction: ASC }) { edges { node { firstName lastName email jobTitle } } } }";

async function waitForMapping(browser: Browser, sourceId: string) {
  await expect
    .poll(
      async () => (await browser.graphql("query { import { id sources { id status } } }")).json(),
      { timeout: 15_000 },
    )
    .toMatchObject({
      data: {
        import: {
          sources: expect.arrayContaining([{ id: sourceId, status: "MAPPED" }]) as unknown,
        },
      },
    });
}
