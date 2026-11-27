import {
  callMcpMethod,
  callMcpTool,
  connectAgent,
  expect,
  registerAgentClient,
  test,
  type TestEnv,
} from "#test/support";

test("tools/list offers eight tools and identifies the card and its app-only decision", async ({
  env,
}) => {
  const { accessToken } = await connectedOwner(env);

  const response = await callMcpMethod(env, accessToken, "tools/list");

  expect(response.status).toBe(200);
  const { result } = (await response.json()) as {
    result: { tools: { name: string; _meta?: unknown }[] };
  };
  expect(result.tools.map(({ name }) => name).sort()).toEqual([
    "decide_approval",
    "find_people",
    "list_my_tasks",
    "my_leave_balance",
    "preview_leave",
    "request_leave",
    "show_approval",
    "who_am_i",
  ]);
  expect(result.tools.find(({ name }) => name === "show_approval")).toMatchObject({
    _meta: { ui: { resourceUri } },
  });
  expect(result.tools.find(({ name }) => name === "decide_approval")).toMatchObject({
    _meta: { ui: { visibility: ["app"] } },
  });
});

test("resources/read serves the approval card as an HTML app", async ({ env }) => {
  const { accessToken } = await connectedOwner(env);

  const response = await callMcpMethod(env, accessToken, "resources/read", { uri: resourceUri });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    result: {
      contents: [
        {
          uri: resourceUri,
          mimeType: "text/html;profile=mcp-app",
          text: expect.stringMatching(/<html\b/i) as unknown,
        },
      ],
    },
  });
});

test.for(["show_approval", "decide_approval"])(
  "%s refuses a read-only connection",
  async (tool, { env }) => {
    const { accessToken } = await connectedOwner(env);
    const response = await callMcpTool(env, accessToken, tool);

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  },
);

test("decide_approval returns a tool error for an invented token on the holder's task", async ({
  env,
}) => {
  const { accessToken, task } = await approvalCard(env);

  const response = await callMcpTool(env, accessToken, "decide_approval", {
    taskId: task.id,
    resultCode: "approved",
    cardToken: "made-up-token",
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    result: {
      isError: true,
      content: [
        {
          type: "text",
          text: "Your agent can't decide this. Press the button on the card, or open the task in Broccoli.",
        },
      ],
    },
  });
});

test("show_approval puts the token only in the card's private metadata", async ({ env }) => {
  const { accessToken, task } = await approvalCard(env);

  const response = await callMcpTool(env, accessToken, "show_approval", { taskId: task.id });

  expect(response.status).toBe(200);
  const { result } = (await response.json()) as {
    result: { _meta: Record<string, string>; content: unknown; structuredContent: unknown };
  };
  expect(result.content).toMatchObject([{ type: "text" }]);
  expect(result.structuredContent).toMatchObject({ taskId: task.id });
  const token = result._meta["broccoli/cardToken"];
  expect(token).toMatch(/\S/);
  expect(JSON.stringify(result.content)).not.toContain(token);
  expect(JSON.stringify(result.structuredContent)).not.toContain(token);
});

const resourceUri = "ui://broccoli/approval-card";

async function connectedOwner(env: TestEnv, scope?: string) {
  const { browser, user } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Approval client");
  const { accessToken } = await connectAgent(env, browser, { clientId, scope });
  return { accessToken, user };
}

async function approvalCard(env: TestEnv) {
  const { accessToken, user } = await connectedOwner(
    env,
    "broccoli:read broccoli:write offline_access",
  );
  const holder = await env.seed.employee({ userId: user.id });
  const task = await env.seed.task({
    assigneeEmployeeId: holder.id,
    resultForm: {
      kind: "choice",
      display: "buttons",
      options: [
        { code: "approved", label: "Approve", commentRequired: false },
        { code: "rejected", label: "Reject", commentRequired: true },
      ],
    },
  });
  return { accessToken, task };
}
