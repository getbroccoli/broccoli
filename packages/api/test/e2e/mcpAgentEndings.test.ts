import {
  authorizeAgent,
  callMcpTool,
  connectAgent,
  expect,
  refreshAgent,
  registerAgentClient,
  test,
} from "#test/support";

test("refuses an MCP batch without returning tool results", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Batch client");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await fetch(`${env.url}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "who_am_i", arguments: {} } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "who_am_i", arguments: {} } },
    ]),
  });

  expect(response.status).toBe(400);
  expect(await response.text()).not.toMatch(/"result"\s*:/);
});

test("a code issued before allowing another client cannot restore the first client's access", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const firstId = await registerAgentClient(env, "First client");
  const { code, verifier, resource } = await authorizeAgent(env, browser, { clientId: firstId });
  const secondId = await registerAgentClient(env, "Second client");
  await connectAgent(env, browser, { clientId: secondId });

  const exchanged = await fetch(`${env.url}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:33418/callback",
      client_id: firstId,
      code_verifier: verifier,
      resource,
    }),
  });
  const tokens = (await exchanged.json()) as { access_token?: string };
  const response = await callMcpTool(env, tokens.access_token ?? "", "who_am_i");

  expect([200, 400, 401, 403]).toContain(exchanged.status);
  expect(response.status).toBe(401);
});

test("allowing a client grants read and offline access without write access", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Read and write client");

  const { scope } = await connectAgent(env, browser, {
    clientId,
    scope: "broccoli:read broccoli:write offline_access",
  });

  expect(scope.split(" ")).toContain("broccoli:read");
  expect(scope.split(" ")).toContain("offline_access");
  expect(scope.split(" ")).not.toContain("broccoli:write");
});

test("a signed-in person cannot widen consent through the provider's endpoint", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Read client");
  await connectAgent(env, browser, { clientId });
  const listed = await browser.get("/api/auth/oauth2/get-consents");
  expect(listed.status).toBe(200);
  const consents = (await listed.json()) as { id: string; clientId: string }[];
  const consent = consents.find((each) => each.clientId === clientId)!;
  expect(consent).toBeDefined();

  const response = await browser.post("/api/auth/oauth2/update-consent", {
    id: consent.id,
    update: { scopes: ["broccoli:read", "broccoli:write", "offline_access"] },
  });

  expect(response.ok).toBe(false);
});

test("a connection unused for 31 days loses access and cannot refresh", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Unused client");
  const { accessToken, refreshToken } = await connectAgent(env, browser, { clientId });
  await env.ageAgentConnection(user.id, 31);

  const response = await callMcpTool(env, accessToken, "who_am_i");
  const refreshed = await refreshAgent(env, { clientId, refreshToken });

  expect(response.status).toBe(401);
  expect(refreshed.status).not.toBe(200);
});

test("a connection used 29 days ago can still call tools", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Recent client");
  const { accessToken } = await connectAgent(env, browser, { clientId });
  await env.ageAgentConnection(user.id, 29);

  const response = await callMcpTool(env, accessToken, "who_am_i");

  expect(response.status).toBe(200);
});

test("calling a tool renews the connection's last use", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Active client");
  const { accessToken } = await connectAgent(env, browser, { clientId });
  await env.ageAgentConnection(user.id, 29);

  const response = await callMcpTool(env, accessToken, "who_am_i");

  expect(response.status).toBe(200);
  const lastUsedAt = await env.readAgentConnectionLastUsedAt(user.id);
  expect(lastUsedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  expect(lastUsedAt.getTime()).toBeLessThanOrEqual(Date.now());
});

test("a signed-in owner cannot create OAuth resources", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const response = await browser.post("/api/auth/admin/oauth2/resources", {
    identifier: "https://elsewhere.example/api/mcp",
    name: "x",
  });

  expect(response.ok).toBe(false);
});
