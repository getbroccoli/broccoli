import {
  type Browser,
  createExternalAgentCode,
  exchangeExternalAgentCode,
  expect,
  test,
  STAFF_PDF as PDF,
} from "#test/support";

test("reads a dropped PDF through owner consent and the agent's people", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const id = await dropPdf(browser);
  const token = await exchangeExternalAgentCode(env.url, code);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const listed = await fetch(`${env.url}/api/external-agent/unmapped-files`, { headers });
  expect(await listed.json()).toEqual([]);

  await allowOriginalFileRead(browser, id);

  const waiting = await fetch(`${env.url}/api/external-agent/unmapped-files`, { headers });
  expect(waiting.status).toBe(200);
  expect(await waiting.json()).toEqual([{ id, way: "read_original_file" }]);
  const original = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/original`, {
    headers,
  });
  expect(original.status).toBe(200);
  expect(original.headers.get("content-type")).toBe("application/pdf");
  expect(original.headers.get("content-disposition")).toBe("attachment");
  expect(Buffer.from(await original.arrayBuffer())).toEqual(PDF);
  const schema = await fetch(`${env.url}/api/external-agent/people-schema`, { headers });
  expect(schema.status).toBe(200);
  expect(await schema.json()).toMatchObject({
    type: "object",
    properties: {
      people: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            fullName: { type: "string" },
            email: { type: "string" },
            jobTitle: { type: "string" },
            startDate: { type: "string" },
          },
        },
      },
    },
  });
  const sent = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/people`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      people: [
        { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
        { fullName: "Robin Reed", email: "robin@example.com" },
      ],
    }),
  });

  expect(sent.status).toBe(200);
  expect(await sent.json()).toEqual({ status: "mapped", failure: null, people: 2, skipped: 0 });
  expect(
    await (
      await browser.graphql(`query {
    import { id sources { id status originalReadAllowed employeeCount } }
  }`)
    ).json(),
  ).toEqual({
    data: {
      import: {
        id: "import",
        sources: [{ id, status: "MAPPED", originalReadAllowed: true, employeeCount: 2 }],
      },
    },
  });
});

test("refuses an original PDF over HTTP before the owner consents", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const id = await dropPdf(browser);
  const token = await exchangeExternalAgentCode(env.url, code);

  const response = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/original`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
});

test("consent wakes an agent waiting for unmapped files", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const id = await dropPdf(browser);
  const token = await exchangeExternalAgentCode(env.url, code);
  await env.restart();
  const readListening = async () =>
    (
      await browser.graphql("query { setup { id ai { id externalAgent { id listening } } } }")
    ).json();
  expect(await readListening()).toMatchObject({
    data: { setup: { ai: { externalAgent: { listening: false } } } },
  });
  const waiting = fetch(`${env.url}/api/external-agent/poll-unmapped-files?wait=30`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  await expect.poll(readListening).toMatchObject({
    data: { setup: { ai: { externalAgent: { listening: true } } } },
  });

  await allowOriginalFileRead(browser, id);

  const response = await waiting;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{ id, way: "read_original_file" }]);
});

test("refuses consent naming a different provider without giving the agent the file", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const id = await dropPdf(browser);
  const token = await exchangeExternalAgentCode(env.url, code);

  const response = await browser.graphql(`mutation {
  allowOriginalFileRead(sourceId: "${id}", aiSource: OPENROUTER) {
    import { id } error { __typename ... on Error { message } }
  }
}`);

  expect(await response.json()).toMatchObject({
    data: {
      allowOriginalFileRead: { import: null, error: { __typename: "ConflictError" } },
    },
  });
  const original = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/original`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(original.status).toBe(404);
});

async function dropPdf(browser: Browser): Promise<string> {
  const uploaded = await browser.post("/api/setup/external-agent-files?name=contractors.pdf", PDF);
  expect(uploaded.status).toBe(200);
  const { id } = (await uploaded.json()) as { id: string };
  expect(id).toEqual(expect.any(String));
  return id;
}

async function allowOriginalFileRead(browser: Browser, sourceId: string): Promise<void> {
  const response = await browser.graphql(
    `mutation AllowOriginalFileRead($sourceId: ID!) {
  allowOriginalFileRead(sourceId: $sourceId, aiSource: EXTERNAL_AGENT) {
    import { id } error { __typename ... on Error { message } }
  }
}`,
    { sourceId },
  );
  expect(await response.json()).toEqual({
    data: { allowOriginalFileRead: { import: { id: "import" }, error: null } },
  });
}
