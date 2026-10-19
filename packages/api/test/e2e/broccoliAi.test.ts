import { onTestFinished } from "vitest";

import {
  type Browser,
  expect,
  type FakeDecisions,
  startFakeDecisions,
  test,
  TestEnv,
  type TestEnvOptions,
  TEST_OWNER,
} from "#test/support";

test("a self-hosted CSV uses Broccoli AI with an install token and placeholders", async ({
  fakeDecisions: relay,
}) => {
  const openRouter = await startFakeDecisions();
  onTestFinished(() => openRouter.stop());
  const { browser } = await selfHostedImport(relay, { decisionsUrl: openRouter.url });

  const sourceId = await uploadFile(browser, "staff.csv");

  await waitForMapped(browser, sourceId);
  const tokens = relay.issuedTokens();
  expect(tokens).toHaveLength(1);
  const tokenRequest = relay.httpRequests().find(({ path }) => path === "/v1/tokens");
  expect(tokenRequest?.headers["x-broccoli-client"]).toMatch(/^broccoli\/\S+$/);
  const decisions = relay.httpRequests().filter(({ path }) => path === "/v1/decisions");
  expect(decisions.length).toBeGreaterThan(0);
  for (const request of decisions) {
    expect(request.headers.authorization).toBe(`Bearer ${tokens[0]}`);
    expect(request.headers["x-broccoli-client"]).toMatch(/^broccoli\/\S+$/);
    expect(request.body).toHaveProperty("provider", { data_collection: "deny", zdr: true });
  }
  const sent = JSON.stringify(relay.requests());
  expect(sent).toContain("Xxxxx Xxxxx");
  expect(sent).toContain("person1@example.com");
  expect(sent).not.toContain("Avery");
  expect(sent).not.toContain("Stone");
  expect(sent).not.toContain("avery@example.com");
  expect(openRouter.httpRequests()).toEqual([]);
});

test("two files uploaded at once share one Broccoli AI token", async ({ fakeDecisions: relay }) => {
  const { browser } = await selfHostedImport(relay);

  const sourceIds = await Promise.all([
    uploadFile(browser, "staff.csv"),
    uploadFile(browser, "more-staff.csv"),
  ]);

  await waitForMapped(browser, ...sourceIds);
  expect(relay.issuedTokens()).toHaveLength(1);
});

test("an unknown Broccoli AI token is replaced and the next file is mapped", async ({
  fakeDecisions: relay,
}) => {
  const { browser } = await selfHostedImport(relay);
  const firstSourceId = await uploadFile(browser, "staff.csv");
  await waitForMapped(browser, firstSourceId);
  const [oldToken] = relay.issuedTokens();
  expect(oldToken).toEqual(expect.any(String));
  relay.forgetTokens();

  const nextSourceId = await uploadFile(browser, "more-staff.csv");

  await waitForMapped(browser, nextSourceId);
  const tokens = relay.issuedTokens();
  expect(tokens).toHaveLength(2);
  expect(tokens[1]).not.toBe(oldToken);
  expect(relay.httpRequests().at(-1)).toMatchObject({
    path: "/v1/decisions",
    headers: { authorization: `Bearer ${tokens[1]}` },
  });
});

test("a restart reuses the stored Broccoli AI token", async ({ fakeDecisions: relay }) => {
  const { env, browser } = await selfHostedImport(relay);
  const firstSourceId = await uploadFile(browser, "staff.csv");
  await waitForMapped(browser, firstSourceId);
  const tokens = relay.issuedTokens();
  expect(tokens).toHaveLength(1);

  await env.restart({ broccoliAiUrl: relay.url });
  const restartedBrowser = env.browser();
  const signedIn = await restartedBrowser.post("/api/auth/sign-in/email", TEST_OWNER);
  expect(signedIn.status).toBe(200);
  const nextSourceId = await uploadFile(restartedBrowser, "more-staff.csv");

  await waitForMapped(restartedBrowser, nextSourceId);
  expect(relay.issuedTokens()).toEqual(tokens);
  expect(relay.httpRequests().at(-1)).toMatchObject({
    path: "/v1/decisions",
    headers: { authorization: `Bearer ${tokens[0]}` },
  });
});

test("a self-hosted OpenRouter key maps the CSV without issuing a Broccoli AI token", async ({
  fakeDecisions: relay,
}) => {
  const openRouter = await startFakeDecisions();
  onTestFinished(() => openRouter.stop());
  openRouter.answer({ headerRow: "1", fullName: "A", email: "B" });
  const { browser } = await selfHostedImport(relay, {
    decisionsUrl: openRouter.url,
    openRouterKey: "own-openrouter-key",
  });

  const sourceId = await uploadFile(browser, "staff.csv");

  await waitForMapped(browser, sourceId);
  const requests = openRouter.httpRequests();
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request).toMatchObject({
      path: "/alpha/decisions",
      headers: { authorization: "Bearer own-openrouter-key" },
    });
  }
  expect(openRouter.issuedTokens()).toEqual([]);
  expect(relay.issuedTokens()).toEqual([]);
  expect(relay.httpRequests()).toEqual([]);
});

test("an expired Broccoli AI free period is reported on the file without the provider's message", async ({
  fakeDecisions: relay,
}) => {
  const { browser } = await selfHostedImport(relay);
  relay.fail(403, "The free period of Broccoli AI is over.", "free_period_over");

  const sourceId = await uploadFile(browser, "staff.csv");

  await expect
    .poll(
      async () =>
        (
          await browser.graphql(`query {
            import { id sources { id status failure failureMessage } }
          }`)
        ).json(),
      { timeout: 15_000 },
    )
    .toEqual({
      data: {
        import: {
          id: "import",
          sources: [
            {
              id: sourceId,
              status: "FAILED",
              failure: "AI_FREE_PERIOD_OVER",
              failureMessage: null,
            },
          ],
        },
      },
    });
});

const CSV = Buffer.from("Name,Email\nAvery Stone,avery@example.com");

async function selfHostedImport(relay: FakeDecisions, options: TestEnvOptions = {}) {
  relay.answer({ headerRow: "1", fullName: "A", email: "B" });
  const env = await TestEnv.start({ broccoliAiUrl: relay.url, ...options });
  onTestFinished(() => env.stop());
  const { browser } = await env.signInAsOwner();
  const company = await browser.graphql(`mutation {
    company {
      update(input: { name: "Acme Corp" }) {
        company { id }
        error { __typename ... on Error { message } }
      }
    }
  }`);
  expect(await company.json()).toEqual({
    data: { company: { update: { company: { id: "company" }, error: null } } },
  });
  return { env, browser };
}

async function uploadFile(browser: Browser, name: string): Promise<string> {
  const response = await browser.post(`/api/imports/files?name=${name}`, CSV);
  expect(response.status).toBe(200);
  const { sourceId } = (await response.json()) as { sourceId: string };
  expect(sourceId).toEqual(expect.any(String));
  return sourceId;
}

async function waitForMapped(browser: Browser, ...sourceIds: string[]): Promise<void> {
  await expect
    .poll(
      async () => (await browser.graphql("query { import { id sources { id status } } }")).json(),
      { timeout: 15_000 },
    )
    .toMatchObject({
      data: {
        import: {
          sources: expect.arrayContaining(
            sourceIds.map((id) => ({ id, status: "MAPPED" })),
          ) as unknown,
        },
      },
    });
}
