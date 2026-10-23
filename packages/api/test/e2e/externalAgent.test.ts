import { createExternalAgentCode, exchangeExternalAgentCode, expect, test } from "#test/support";

test("maps a dropped file through masked questions and shows its people to the holder", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  expect(await (await browser.graphql(PEOPLE)).json()).toMatchObject({
    data: { import: { employees: { edges: [] } } },
  });
  const uploaded = await browser.post(
    "/api/setup/external-agent-files?name=staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  expect(uploaded.status).toBe(200);
  const { id } = (await uploaded.json()) as { id: string };
  const token = await exchangeExternalAgentCode(env.url, code);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const listed = await fetch(`${env.url}/api/external-agent/unmapped-files`, { headers });
  expect(listed.status).toBe(200);
  expect(listed.headers.get("cache-control")).toBe("no-store");
  expect(await listed.json()).toEqual([{ id, way: "answer_masked_questions" }]);
  const questions = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/questions`, {
    headers,
  });
  expect(questions.status).toBe(200);
  expect(questions.headers.get("cache-control")).toBe("no-store");
  expect(await questions.json()).toMatchObject({
    sheets: [{ sheet: 1, questions: { headerRow: { options: { "1": "Row 1" } } } }],
  });
  const answered = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/answers`, {
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
      await browser.graphql("query { setup { id ai { id source externalAgent { id client } } } }")
    ).json(),
  ).toEqual({
    data: {
      setup: {
        id: "instance",
        ai: {
          id: "ai",
          source: "EXTERNAL_AGENT",
          externalAgent: { id: "external-agent", client: "Test agent" },
        },
      },
    },
  });
});

test("shows the holder that the external agent is listening right after the exchange", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);

  await exchangeExternalAgentCode(env.url, code);

  expect(
    await (
      await browser.graphql("query { setup { id ai { id externalAgent { id listening } } } }")
    ).json(),
  ).toEqual({
    data: {
      setup: {
        id: "instance",
        ai: { id: "ai", externalAgent: { id: "external-agent", listening: true } },
      },
    },
  });
});

test("answers an empty list when the unmapped-files poll runs out", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const token = await exchangeExternalAgentCode(env.url, code);

  const response = await fetch(`${env.url}/api/external-agent/poll-unmapped-files?wait=1`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});

test.for(["0", "601", "1.5", "soon", ""])(
  "refuses an invalid unmapped-files poll wait of %s",
  async (wait, { env }) => {
    const browser = await env.startSetupAtImport();
    const code = await createExternalAgentCode(browser);
    const token = await exchangeExternalAgentCode(env.url, code);

    const response = await fetch(`${env.url}/api/external-agent/poll-unmapped-files?wait=${wait}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_INPUT", fields: [{ field: "wait", code: "invalid" }] },
    });
  },
);

test("shows the holder that the external agent picked up a dropped file", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const token = await exchangeExternalAgentCode(env.url, code);
  const uploaded = await browser.post(
    "/api/setup/external-agent-files?name=staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  expect(uploaded.status).toBe(200);
  const { id } = (await uploaded.json()) as { id: string };
  const query = "query { import { id sources { id pickedUpByExternalAgent } } }";
  expect(await (await browser.graphql(query)).json()).toEqual({
    data: { import: { id: "import", sources: [{ id, pickedUpByExternalAgent: false }] } },
  });

  const questions = await fetch(`${env.url}/api/external-agent/unmapped-files/${id}/questions`, {
    headers: { authorization: `Bearer ${token}` },
  });

  expect(questions.status).toBe(200);
  expect(await (await browser.graphql(query)).json()).toEqual({
    data: { import: { id: "import", sources: [{ id, pickedUpByExternalAgent: true }] } },
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
    const code = await createExternalAgentCode(browser);
    const token = await exchangeExternalAgentCode(env.url, code);
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
      'mutation { approveImport(version: "reviewed-version") { import { id } error { __typename } } }',
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
    for (const path of ["/api/imports/files", "/api/setup/external-agent-files"]) {
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
  const code = await createExternalAgentCode(browser);
  const token = await exchangeExternalAgentCode(env.url, code);
  const disconnected = await browser.graphql(
    "mutation { disconnectExternalAgent { setup { id } } }",
  );
  expect(await disconnected.json()).toEqual({
    data: { disconnectExternalAgent: { setup: { id: "instance" } } },
  });

  const response = await fetch(`${env.url}/api/external-agent/unmapped-files`, {
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
  const code = await createExternalAgentCode(browser);
  const token = await exchangeExternalAgentCode(env.url, code);

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
  const response = await fetch(`${env.url}/api/external-agent/skill`);

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/markdown");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.text()).trim().length).toBeGreaterThan(0);
});

const PEOPLE = `query {
  import {
    id version sources { id readBy }
    employees { edges { node { id firstName { value } lastName { value } email { value } } } }
  }
}`;
