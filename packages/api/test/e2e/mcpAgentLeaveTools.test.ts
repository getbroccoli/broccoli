import { callMcpTool, connectAgent, expect, registerAgentClient, test } from "#test/support";

test("a read-only agent can check leave, preview it and list tasks", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Read client");
  const { accessToken } = await connectAgent(env, browser, { clientId });
  const reason = "You have no employee record in Broccoli.";

  const balance = await callMcpTool(env, accessToken, "my_leave_balance");
  const preview = await callMcpTool(env, accessToken, "preview_leave", {
    timeOffTypeId: "00000000-0000-4000-8000-000000000001",
    startDate: "2026-12-07",
    endDate: "2026-12-07",
  });
  const tasks = await callMcpTool(env, accessToken, "list_my_tasks");

  expect(await balance.json()).toMatchObject({
    result: { structuredContent: { types: [], reason } },
  });
  expect(preview.status).toBe(200);
  expect(await tasks.json()).toMatchObject({
    result: {
      structuredContent: {
        needsYou: [],
        waitingOnOthers: [],
        resolvedRecently: [],
        reason,
      },
    },
  });
});

test("read tools refuse a token without broccoli:read", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Write-only client");
  const { accessToken } = await connectAgent(env, browser, {
    clientId,
    scope: "broccoli:write offline_access",
  });

  for (const tool of ["who_am_i", "my_leave_balance", "preview_leave", "list_my_tasks"]) {
    const response = await callMcpTool(env, accessToken, tool);
    expect(response.status, tool).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  }
});

test("request_leave tells a read-only agent which scopes to request", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Read client");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await callMcpTool(env, accessToken, "request_leave");

  expect(response.status).toBe(403);
  const challenge = response.headers.get("www-authenticate");
  expect(challenge).toContain('error="insufficient_scope"');
  expect(challenge).toContain('scope="broccoli:read broccoli:write"');
});
