import {
  connectAgent,
  expect,
  registerAgentClient,
  sseMessages,
  test,
  TEST_OWNER,
} from "#test/support";

test("connecting an agent and disconnecting each send the person's stream one nudge", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const response = await browser.get("/api/live");
  const messages = sseMessages(response);
  try {
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(response.headers.get("cache-control")).toBe("no-store");

    await connectAgent(env, browser, { clientId });

    expect(await messages.next()).toBe('{"type":"agentConnection.changed"}');

    const disconnected = await browser.graphql(
      "mutation { mcpAgents { disconnect { endedAgentConnection { reason } } } }",
    );

    expect(await disconnected.json()).toEqual({
      data: {
        mcpAgents: { disconnect: { endedAgentConnection: { reason: "DISCONNECTED_BY_PERSON" } } },
      },
    });
    expect(await messages.next()).toBe('{"type":"agentConnection.changed"}');
    expect(await messages.next(100)).toBeNull();
  } finally {
    await messages.cancel();
  }
});

test("refuses a live stream without a session", async ({ env }) => {
  await env.signInAsOwner();

  const response = await env.browser().get("/api/live");

  try {
    expect(response.status).toBe(401);
  } finally {
    await response.body?.cancel();
  }
});

test("a person's stream receives no nudge when another person's connection changes", async ({
  env,
}) => {
  const { browser: owner } = await env.signInAsOwner();
  const credentials = { email: "another@example.com", password: TEST_OWNER.password };
  await env.seed.user(credentials);
  const { browser } = await env.signIn(credentials);
  const clientId = await registerAgentClient(env, "Claude Code");
  const response = await browser.get("/api/live");
  const messages = sseMessages(response);
  try {
    expect(response.status).toBe(200);

    await connectAgent(env, owner, { clientId });
    await connectAgent(env, browser, { clientId });

    expect(await messages.next()).toBe('{"type":"agentConnection.changed"}');
    expect(await messages.next(100)).toBeNull();
  } finally {
    await messages.cancel();
  }
});
