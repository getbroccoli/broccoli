import { createAgentCode, exchangeAgentCode, expect, test } from "#test/support";

test("shows the pending agent code's way and expiry without exposing its secret", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  await createAgentCode(browser, "PARSES_ORIGINAL_FILES");

  const response = await browser.graphql(
    "query { setup { id ai { id agentCode { way expiresAt } } } }",
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: {
      setup: {
        id: "instance",
        ai: {
          id: "ai",
          agentCode: {
            way: "PARSES_ORIGINAL_FILES",
            expiresAt: expect.any(String) as unknown,
          },
        },
      },
    },
  });
  const secret = await browser.graphql("query { setup { id ai { id agentCode { code } } } }");
  expect(secret.status).toBe(400);
  expect(await secret.json()).toMatchObject({
    errors: [
      {
        message: 'Cannot query field "code" on type "PendingAgentCode".',
        extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
      },
    ],
  });
});

test("maps a dropped file through masked questions and shows its people to the holder", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const code = await createAgentCode(browser, "ANSWERS_MASKED_QUESTIONS");
  expect(await (await browser.graphql(PEOPLE)).json()).toMatchObject({
    data: { import: { employees: { edges: [] } } },
  });
  const uploaded = await browser.post(
    "/api/setup/agent-files?name=staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  expect(uploaded.status).toBe(200);
  const { id } = (await uploaded.json()) as { id: string };
  const token = await exchangeAgentCode(env.url, code, "answers_masked_questions");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const listed = await fetch(`${env.url}/api/agent/files`, { headers });
  expect(listed.status).toBe(200);
  expect(listed.headers.get("cache-control")).toBe("no-store");
  expect(await listed.json()).toEqual([{ id, status: "mapping", failure: null, people: 0 }]);
  const questions = await fetch(`${env.url}/api/agent/files/${id}/questions`, { headers });
  expect(questions.status).toBe(200);
  expect(questions.headers.get("cache-control")).toBe("no-store");
  expect(await questions.json()).toMatchObject({
    sheets: [{ sheet: 1, questions: { headerRow: { options: { "1": "Row 1" } } } }],
  });
  const answered = await fetch(`${env.url}/api/agent/files/${id}/answers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sheets: [
        {
          sheet: 1,
          answers: {
            headerRow: "1",
            fullName: "A",
            firstName: "none",
            lastName: "none",
            email: "B",
            jobTitle: "none",
            startDate: "none",
          },
        },
      ],
    }),
  });

  expect(answered.status).toBe(200);
  expect(answered.headers.get("cache-control")).toBe("no-store");
  expect(await answered.json()).toEqual({ status: "mapped", failure: null, people: 1 });
  expect(await (await browser.graphql(PEOPLE)).json()).toMatchObject({
    data: {
      import: {
        sources: [{ id, readBy: "ANSWERED_BY_EXTERNAL_AGENT" }],
        employees: {
          edges: [
            {
              node: {
                firstName: { value: "Avery" },
                lastName: { value: "Stone" },
                email: { value: "avery@example.com" },
              },
            },
          ],
        },
      },
    },
  });
  expect(
    await (
      await browser.graphql("query { setup { id ai { id source agent { id client way } } } }")
    ).json(),
  ).toEqual({
    data: {
      setup: {
        id: "instance",
        ai: {
          id: "ai",
          source: "AGENT",
          agent: { id: "agent", client: "Test agent", way: "ANSWERS_MASKED_QUESTIONS" },
        },
      },
    },
  });
});

test("imports parsed people and shows them to the holder", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createAgentCode(browser, "PARSES_ORIGINAL_FILES");
  expect(await (await browser.graphql(PEOPLE)).json()).toMatchObject({
    data: { import: { employees: { edges: [] } } },
  });
  const token = await exchangeAgentCode(env.url, code, "parses_original_files");

  const response = await fetch(`${env.url}/api/agent/people`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com" }],
    }),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = (await response.json()) as { id: string; people: number; skipped: number };
  expect(result.id).toBeTypeOf("string");
  expect(result).toMatchObject({ people: 1, skipped: 0 });
  expect(await (await browser.graphql(PEOPLE)).json()).toMatchObject({
    data: {
      import: {
        sources: [{ id: result.id, readBy: "PARSED_BY_EXTERNAL_AGENT" }],
        employees: {
          edges: [
            {
              node: {
                firstName: { value: "Avery" },
                lastName: { value: "Stone" },
                email: { value: "avery@example.com" },
              },
            },
          ],
        },
      },
    },
  });
});

test.for([
  { bearer: "valid", cookie: false },
  { bearer: "valid", cookie: true },
  { bearer: "invalid", cookie: false },
  { bearer: "invalid", cookie: true },
  { bearer: "malformed", cookie: false },
  { bearer: "malformed", cookie: true },
])(
  "refuses $bearer authorization on browser routes with cookie=$cookie",
  async ({ bearer, cookie }, { env }) => {
    const browser = await env.startSetupAtImport();
    const started = await browser.post("/api/auth/setup/start", undefined);
    const setupCookie = started.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    expect(setupCookie).toContain("broccoli_setup=");
    const code = await createAgentCode(browser, "ANSWERS_MASKED_QUESTIONS");
    const token = await exchangeAgentCode(env.url, code, "answers_masked_questions");
    const authorization =
      bearer === "valid"
        ? `Bearer ${token}`
        : bearer === "invalid"
          ? "Bearer invalid"
          : "Bearer two tokens";
    const headers = {
      authorization,
      cookie: cookie ? setupCookie : "",
      origin: env.url,
      "content-type": "application/json",
    };

    for (const query of [
      "{ ping }",
      "{ setup { id } }",
      "{ import { id } }",
      'mutation { import { approve(version: "reviewed-version") { import { id } error { __typename } } } }',
    ]) {
      const response = await fetch(`${env.url}/api/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      });
      const body = (await response.json()) as { data?: unknown; errors?: unknown };
      expect(body).toMatchObject({ errors: [{ extensions: { code: "UNAUTHENTICATED" } }] });
      expect(body.data).toBeFalsy();
    }
    for (const path of ["/api/imports/files", "/api/setup/agent-files"]) {
      const response = await fetch(`${env.url}${path}?name=staff.csv`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/octet-stream" },
        body: "Name\nAvery Stone",
      });
      expect(response.status).toBe(401);
    }
  },
);

test("refuses the agent after the holder disconnects it", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createAgentCode(browser, "ANSWERS_MASKED_QUESTIONS");
  const token = await exchangeAgentCode(env.url, code, "answers_masked_questions");
  const disconnected = await browser.graphql(
    "mutation { setup { disconnectAgent { setup { id } } } }",
  );
  expect(await disconnected.json()).toEqual({
    data: { setup: { disconnectAgent: { setup: { id: "instance" } } } },
  });

  const response = await fetch(`${env.url}/api/agent/files`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
});

test("refuses a bearer on the demo auth endpoint even with the holder's valid cookie", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const started = await browser.post("/api/auth/setup/start", undefined);
  const cookie = started.headers
    .getSetCookie()
    .find((value) => value.startsWith("broccoli_setup="))!
    .split(";", 1)[0]!;
  const code = await createAgentCode(browser, "ANSWERS_MASKED_QUESTIONS");
  const token = await exchangeAgentCode(env.url, code, "answers_masked_questions");

  const response = await fetch(`${env.url}/api/auth/setup/demo`, {
    method: "POST",
    headers: { origin: env.url, cookie, authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await (await browser.graphql("query { setup { id step holder } }")).json()).toEqual({
    data: { setup: { id: "instance", step: "IMPORT", holder: "YOU" } },
  });
});

test("serves the skill as uncached Markdown", async ({ env }) => {
  const response = await fetch(`${env.url}/api/agent/skill`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/markdown");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.text()).trim().length).toBeGreaterThan(0);
});

test("returns parsed-people field errors without echoing private input", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createAgentCode(browser, "PARSES_ORIGINAL_FILES");
  const token = await exchangeAgentCode(env.url, code, "parses_original_files");

  const response = await fetch(`${env.url}/api/agent/people`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: "staff.pdf",
      people: [{ "private-key-sentinel": "private-value-sentinel" }],
    }),
  });

  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    error: { code: "INVALID_INPUT", fields: [{ field: "people[0]", code: "unknown_field" }] },
  });
});

const PEOPLE = `query {
  import {
    id version sources { id readBy }
    employees { edges { node { id firstName { value } lastName { value } email { value } } } }
  }
}`;
