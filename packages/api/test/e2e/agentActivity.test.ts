import {
  type Browser,
  callMcpTool,
  connectAgent,
  expect,
  registerAgentClient,
  test,
} from "#test/support";

test("who_am_i records an answered call with no result count", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await callMcpTool(env, accessToken, "who_am_i");

  expect(response.status).toBe(200);
  expect(await readActivity(browser)).toEqual({
    data: {
      myAgentActivity: {
        edges: [
          {
            node: {
              id: expect.any(String) as unknown,
              tool: "who_am_i",
              outcome: "ANSWERED_BY_BROCCOLI",
              resultCount: null,
              calledAt: expect.any(String) as unknown,
            },
          },
        ],
      },
    },
  });
});

test("find_people activity shows the returned count without the search or people's details", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  await env.seed.employee({ firstName: "Avery", lastName: "Stone" });
  await env.seed.employee({ firstName: "Robin", lastName: "Reed" });
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await callMcpTool(env, accessToken, "find_people", { search: "Avery" });

  expect(response.status).toBe(200);
  const answer = (await response.json()) as {
    result: { structuredContent: { people: unknown[] } };
  };
  expect(answer.result.structuredContent.people).toHaveLength(1);
  expect(await readActivity(browser)).toEqual({
    data: {
      myAgentActivity: {
        edges: [
          {
            node: {
              id: expect.any(String) as unknown,
              tool: "find_people",
              outcome: "ANSWERED_BY_BROCCOLI",
              resultCount: answer.result.structuredContent.people.length,
              calledAt: expect.any(String) as unknown,
            },
          },
        ],
      },
    },
  });
});

test("a call without broccoli:read records a refusal", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Write-only client");
  const { accessToken } = await connectAgent(env, browser, {
    clientId,
    scope: "broccoli:write offline_access",
  });

  const response = await callMcpTool(env, accessToken, "who_am_i");

  expect(response.status).toBe(403);
  expect(await readActivity(browser)).toEqual({
    data: {
      myAgentActivity: {
        edges: [
          {
            node: {
              id: expect.any(String) as unknown,
              tool: "who_am_i",
              outcome: "REFUSED_BY_BROCCOLI",
              resultCount: null,
              calledAt: expect.any(String) as unknown,
            },
          },
        ],
      },
    },
  });
});

test("find_people with an invalid cursor records a refusal", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await callMcpTool(env, accessToken, "find_people", { after: "invalid-cursor" });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ result: { isError: true } });
  expect(await readActivity(browser)).toEqual({
    data: {
      myAgentActivity: {
        edges: [
          {
            node: {
              id: expect.any(String) as unknown,
              tool: "find_people",
              outcome: "REFUSED_BY_BROCCOLI",
              resultCount: null,
              calledAt: expect.any(String) as unknown,
            },
          },
        ],
      },
    },
  });
});

test("find_people with a search longer than 100 characters records a refusal", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await callMcpTool(env, accessToken, "find_people", { search: "a".repeat(101) });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ result: { isError: true } });
  expect(await readActivity(browser)).toEqual({
    data: {
      myAgentActivity: {
        edges: [
          {
            node: {
              id: expect.any(String) as unknown,
              tool: "find_people",
              outcome: "REFUSED_BY_BROCCOLI",
              resultCount: null,
              calledAt: expect.any(String) as unknown,
            },
          },
        ],
      },
    },
  });
});

test("tools/list and a call after disconnect record no activity", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const tools = await fetch(`${env.url}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  expect(tools.status).toBe(200);
  expect(await tools.json()).toMatchObject({ result: { tools: expect.any(Array) as unknown } });
  expect(await readActivity(browser)).toEqual({ data: { myAgentActivity: { edges: [] } } });
  const disconnected = await browser.graphql(
    "mutation { mcpAgents { disconnect { endedAgentConnection { id reason } } } }",
  );
  expect(await disconnected.json()).toMatchObject({
    data: {
      mcpAgents: { disconnect: { endedAgentConnection: { reason: "DISCONNECTED_BY_PERSON" } } },
    },
  });
  expect((await callMcpTool(env, accessToken, "who_am_i")).status).toBe(401);
  expect(await readActivity(browser)).toEqual({ data: { myAgentActivity: { edges: [] } } });
});

async function readActivity(browser: Browser): Promise<unknown> {
  const response = await browser.graphql(`
    query {
      myAgentActivity {
        edges { node { id tool outcome resultCount calledAt } }
      }
    }
  `);
  return response.json();
}
