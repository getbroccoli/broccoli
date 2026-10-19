import { onTestFinished } from "vitest";

import {
  type Browser,
  expect,
  signInAsManagedOwner,
  startFakeDecisions,
  startManagedEnv,
  test,
  TestEnv,
  type TestEnvOptions,
} from "#test/support";

test("choosing Broccoli AI prepares one token and maps a CSV with it despite an environment key", async ({
  fakeDecisions: relay,
}) => {
  const openRouter = await startFakeDecisions();
  onTestFinished(() => openRouter.stop());
  relay.answer({ headerRow: "1", fullName: "A", email: "B" });
  const browser = await setupHolder({
    broccoliAiUrl: relay.url,
    decisionsUrl: openRouter.url,
    openRouterKey: "environment-key",
  });

  const chosen = await browser.graphql(CHOOSE_AI_SOURCE, { input: { source: "BROCCOLI_AI" } });

  expect(await chosen.json()).toEqual({
    data: {
      setup: {
        chooseAiSource: {
          setup: {
            id: "instance",
            ai: { id: "ai", source: "BROCCOLI_AI", openRouterKey: "ENVIRONMENT" },
          },
          error: null,
        },
      },
    },
  });
  expect(relay.issuedTokens()).toHaveLength(1);
  const [token] = relay.issuedTokens();
  await mapCsv(browser);
  expect(relay.issuedTokens()).toEqual([token]);
  const requests = relay.httpRequests().filter(({ path }) => path === "/v1/decisions");
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.headers.authorization).toBe(`Bearer ${token}`);
  }
  expect(openRouter.httpRequests()).toEqual([]);
  expect(await (await browser.graphql("query { setup { id ai { id source } } }")).json()).toEqual({
    data: { setup: { id: "instance", ai: { id: "ai", source: "BROCCOLI_AI" } } },
  });
});

test("choosing a pasted OpenRouter key checks it and maps a CSV with it instead of the environment key", async ({
  fakeDecisions: relay,
}) => {
  const openRouter = await startFakeDecisions();
  onTestFinished(() => openRouter.stop());
  openRouter.acceptKey("pasted-key");
  openRouter.answer({ headerRow: "1", fullName: "A", email: "B" });
  const browser = await setupHolder({
    broccoliAiUrl: relay.url,
    decisionsUrl: openRouter.url,
    openRouterKey: "environment-key",
  });

  const chosen = await browser.graphql(CHOOSE_AI_SOURCE, {
    input: { source: "OPENROUTER", openRouterKey: "pasted-key" },
  });

  expect(await chosen.json()).toEqual({
    data: {
      setup: {
        chooseAiSource: {
          setup: { id: "instance", ai: { id: "ai", source: "OPENROUTER", openRouterKey: "SAVED" } },
          error: null,
        },
      },
    },
  });
  await mapCsv(browser);
  expect(openRouter.httpRequests().find(({ path }) => path === "/v1/key")).toMatchObject({
    headers: { authorization: "Bearer pasted-key" },
  });
  const requests = openRouter.httpRequests().filter(({ path }) => path === "/alpha/decisions");
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.headers.authorization).toBe("Bearer pasted-key");
  }
  expect(relay.httpRequests()).toEqual([]);
});

test("reports an OpenRouter environment key without returning the key", async () => {
  const browser = await setupHolder({ openRouterKey: "environment-key" });

  const response = await browser.graphql("query { setup { id ai { id source openRouterKey } } }");

  expect(await response.json()).toEqual({
    data: {
      setup: {
        id: "instance",
        ai: { id: "ai", source: "OPENROUTER", openRouterKey: "ENVIRONMENT" },
      },
    },
  });
});

test("keeps setup public while refusing anonymous access to the AI choice", async ({ env }) => {
  const response = await env
    .browser()
    .graphql("query { setup { id step mode holder ai { id source } } }");

  expect(await response.json()).toMatchObject({
    data: {
      setup: { id: "instance", step: "COMPANY", mode: "SELF_HOSTED", holder: "NOBODY", ai: null },
    },
    errors: [{ path: ["setup", "ai"], extensions: { code: "UNAUTHENTICATED" } }],
  });
});

test("returns a field error when OpenRouter rejects the pasted key", async ({
  fakeDecisions: openRouter,
}) => {
  const browser = await setupHolder({ decisionsUrl: openRouter.url });

  const response = await browser.graphql(CHOOSE_AI_SOURCE, {
    input: { source: "OPENROUTER", openRouterKey: "rejected-key" },
  });

  expect(await response.json()).toMatchObject({
    data: {
      setup: {
        chooseAiSource: {
          setup: null,
          error: {
            __typename: "InvalidInputError",
            fields: [{ field: "openRouterKey", code: "rejected" }],
          },
        },
      },
    },
  });
});

test("returns a source error when the relay refuses an already used free period", async ({
  fakeDecisions: relay,
}) => {
  relay.refuseTokens(429, "free_period_used");
  const browser = await setupHolder({ broccoliAiUrl: relay.url });

  const response = await browser.graphql(CHOOSE_AI_SOURCE, { input: { source: "BROCCOLI_AI" } });

  expect(await response.json()).toMatchObject({
    data: {
      setup: {
        chooseAiSource: {
          setup: null,
          error: {
            __typename: "InvalidInputError",
            fields: [{ field: "source", code: "free_period_used" }],
          },
        },
      },
    },
  });
});

test("refuses an AI choice on a managed instance without contacting either provider", async ({
  fakeDecisions: relay,
}) => {
  const openRouter = await startFakeDecisions();
  onTestFinished(() => openRouter.stop());
  const { env, accounts } = await startManagedEnv({
    decisionsUrl: openRouter.url,
    broccoliAiUrl: relay.url,
  });
  const browser = await signInAsManagedOwner(env, accounts);

  const response = await browser.graphql(CHOOSE_AI_SOURCE, { input: { source: "BROCCOLI_AI" } });

  expect(await response.json()).toMatchObject({
    data: { setup: { chooseAiSource: { setup: null, error: { __typename: "ConflictError" } } } },
  });
  expect(openRouter.httpRequests()).toEqual([]);
  expect(relay.httpRequests()).toEqual([]);
});

const CHOOSE_AI_SOURCE = `mutation ChooseAiSource($input: AiSourceInput!) {
  setup {
    chooseAiSource(input: $input) {
      setup { id ai { id source openRouterKey } }
      error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } }
    }
  }
}`;

async function setupHolder(options: TestEnvOptions = {}): Promise<Browser> {
  const env = await TestEnv.start(options);
  onTestFinished(() => env.stop());
  const browser = env.browser();
  expect((await browser.post("/api/auth/setup/start", undefined)).status).toBe(200);
  const named = await browser.graphql(`mutation {
    company { update(input: { name: "Acme Corp" }) { company { id } error { __typename ... on Error { message } } } }
  }`);
  expect(await named.json()).toEqual({
    data: { company: { update: { company: { id: "company" }, error: null } } },
  });
  return browser;
}

async function mapCsv(browser: Browser): Promise<void> {
  const uploaded = await browser.post(
    "/api/imports/files?name=staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  expect(uploaded.status).toBe(200);
  const { sourceId } = (await uploaded.json()) as { sourceId: string };
  expect(sourceId).toEqual(expect.any(String));
  await expect
    .poll(
      async () => (await browser.graphql("query { import { id sources { id status } } }")).json(),
      { timeout: 15_000 },
    )
    .toEqual({ data: { import: { id: "import", sources: [{ id: sourceId, status: "MAPPED" }] } } });
}
