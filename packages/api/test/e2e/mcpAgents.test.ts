import { createHash } from "node:crypto";

import {
  authorize,
  callMcpTool,
  connectAgent,
  expect,
  refreshAgent,
  registerAgentClient,
  RESEND_CHOICE,
  SAVE_MAIL_SETTINGS,
  startMailTestEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("publishes the MCP resource and OAuth authorization server metadata", async ({ env }) => {
  const resource = await fetch(`${env.url}/.well-known/oauth-protected-resource/api/mcp`);
  const authorization = await fetch(`${env.url}/.well-known/oauth-authorization-server/api/auth`);

  expect(resource.status).toBe(200);
  expect(await resource.json()).toEqual({
    resource: `${env.url}/api/mcp`,
    authorization_servers: [`${env.url}/api/auth`],
    scopes_supported: ["broccoli:read", "broccoli:write", "offline_access"],
    bearer_methods_supported: ["header"],
  });
  expect(authorization.status).toBe(200);
  expect(await authorization.json()).toMatchObject({
    issuer: `${env.url}/api/auth`,
    authorization_endpoint: `${env.url}/api/auth/oauth2/authorize`,
    token_endpoint: `${env.url}/api/auth/oauth2/token`,
    registration_endpoint: `${env.url}/api/auth/oauth2/register`,
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  });
});

test("challenges an MCP call without a token with its resource metadata", async ({ env }) => {
  const response = await fetch(`${env.url}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "who_am_i", arguments: {} },
    }),
  });

  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain(
    `resource_metadata="${env.url}/.well-known/oauth-protected-resource/api/mcp"`,
  );
});

test("registers a client without an auth method as a public client", async ({ env }) => {
  const response = await fetch(`${env.url}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude Code",
      redirect_uris: ["http://127.0.0.1:33418/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });

  expect(response.ok).toBe(true);
  const client = await response.json();
  expect(client).toMatchObject({
    client_id: expect.any(String) as unknown,
    token_endpoint_auth_method: "none",
  });
  expect(client).not.toHaveProperty("client_secret");
});

test("refuses registration with client_secret_basic", async ({ env }) => {
  const response = await fetch(`${env.url}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Confidential client",
      redirect_uris: ["http://127.0.0.1:33418/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    }),
  });

  expect(response.status).toBe(400);
});

test("an owner connects an agent and reads their identity", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await callMcpTool(env, accessToken, "who_am_i");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    result: {
      structuredContent: {
        email: user.email,
        permissionProfiles: expect.arrayContaining(["OWNER"]) as unknown,
      },
    },
  });
});

test("malformed JSON with a valid read token returns a JSON-RPC parse error", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Read client");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await fetch(`${env.url}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: "not json",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700 },
  });
});

test("authorization preserves a signed-out browser's request through login", async ({ env }) => {
  await env.seed.owner(TEST_OWNER);
  const clientId = await registerAgentClient(env, "Claude Code");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:33418/callback",
    scope: "broccoli:read offline_access",
    state: "1e3",
    code_challenge: createHash("sha256").update("v".repeat(43)).digest("base64url"),
    code_challenge_method: "S256",
    resource: `${env.url}/api/mcp`,
  });
  params.set("prompt", "login");

  const location = await authorize(env, env.browser(), params);

  expect(location.pathname).toBe("/api/auth/agent/sign-in");
  const response = await fetch(location, { redirect: "manual" });
  expect(response.status).toBe(302);
  const login = new URL(response.headers.get("location")!, env.url);
  expect(login.pathname).toBe("/login");
  const redirect = new URL(login.searchParams.get("redirect")!, env.url);
  expect(redirect.pathname).toBe("/api/auth/oauth2/authorize");
  params.delete("prompt");
  expect(Object.fromEntries(redirect.searchParams)).toEqual(Object.fromEntries(params));
});

test("authorization preserves the signed request and state through consent", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:33418/callback",
    scope: "broccoli:read offline_access",
    state: "12345678901234567890",
    code_challenge: createHash("sha256").update("v".repeat(43)).digest("base64url"),
    code_challenge_method: "S256",
    resource: `${env.url}/api/mcp`,
  });

  const location = await authorize(env, browser, params);

  expect(location.pathname).toBe("/api/auth/agent/allow");
  const response = await fetch(location, { redirect: "manual" });
  expect(response.status).toBe(302);
  const allow = new URL(response.headers.get("location")!, env.url);
  expect(allow.pathname).toBe("/agent/allow");
  expect([...allow.searchParams]).toEqual([["request", location.search.slice(1)]]);

  const consent = await browser.post("/api/auth/oauth2/consent", {
    accept: true,
    oauth_query: allow.searchParams.get("request"),
  });

  expect(consent.status).toBe(200);
  const approved = (await consent.json()) as { redirect: boolean; url: string };
  expect(approved.redirect).toBe(true);
  const callback = new URL(approved.url);
  expect(callback.origin + callback.pathname).toBe("http://127.0.0.1:33418/callback");
  expect(callback.searchParams.get("code")).toBeTruthy();
  expect(callback.searchParams.get("state")).toBe("12345678901234567890");
});

test("an agent cannot ask for a token for another resource", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Other resource");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:33418/callback",
    scope: "broccoli:read offline_access",
    state: "resource-state",
    resource: "https://elsewhere.example/api/mcp",
    code_challenge: createHash("sha256").update("v".repeat(43)).digest("base64url"),
    code_challenge_method: "S256",
  });

  const location = await authorize(env, browser, params);

  expect(location.origin + location.pathname).toBe("http://127.0.0.1:33418/callback");
  expect(location.searchParams.get("error")).toBe("invalid_target");
});

test("who_am_i refuses a token without broccoli:read", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Write-only client");
  const { accessToken } = await connectAgent(env, browser, {
    clientId,
    scope: "broccoli:write offline_access",
  });

  const response = await callMcpTool(env, accessToken, "who_am_i");

  expect(response.status).toBe(403);
  expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
});

test("allowing a second client ends the first client's access and refresh tokens", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const firstId = await registerAgentClient(env, "First client");
  const first = await connectAgent(env, browser, { clientId: firstId });
  const secondId = await registerAgentClient(env, "Second client");

  const second = await connectAgent(env, browser, { clientId: secondId });

  expect((await callMcpTool(env, first.accessToken, "who_am_i")).status).toBe(401);
  expect(
    (await refreshAgent(env, { clientId: firstId, refreshToken: first.refreshToken })).status,
  ).not.toBe(200);
  expect((await callMcpTool(env, second.accessToken, "who_am_i")).status).toBe(200);
});

test("resetting a password ends the agent's access and refresh tokens", async () => {
  const { env, owner, resend } = await startMailTestEnv();
  const saved = await owner.graphql(SAVE_MAIL_SETTINGS, { input: RESEND_CHOICE });
  expect(await saved.json()).toMatchObject({
    data: { system: { saveMailSettings: { error: null } } },
  });
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken, refreshToken } = await connectAgent(env, owner, { clientId });
  const browser = env.browser();
  expect(
    (await browser.post("/api/auth/request-password-reset", { email: TEST_OWNER.email })).status,
  ).toBe(200);
  await expect.poll(() => resend.emails.length, { timeout: 15_000 }).toBe(1);
  const link = new URL(resend.emails[0]!.body.text.match(/https?:\/\/\S+/)![0]);

  const reset = await browser.post("/api/auth/reset-password", {
    newPassword: "a new correct horse battery staple",
    token: link.hash.slice(1),
  });

  expect(reset.status).toBe(200);
  expect((await callMcpTool(env, accessToken, "who_am_i")).status).toBe(401);
  expect((await refreshAgent(env, { clientId, refreshToken })).status).not.toBe(200);
});

test("the agent can refresh and call tools after the browser session expires", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { refreshToken } = await connectAgent(env, browser, { clientId });
  await env.expireSessionAt(user.id, new Date(Date.now() - 1000));

  const refreshed = await refreshAgent(env, { clientId, refreshToken });

  expect(refreshed.status).toBe(200);
  const tokens = (await refreshed.json()) as { access_token: string };
  expect(tokens.access_token).toBeTruthy();
  expect((await callMcpTool(env, tokens.access_token, "who_am_i")).status).toBe(200);
});

test("an agent token gives no authority on GraphQL", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const clientId = await registerAgentClient(env, "Claude Code");
  const { accessToken } = await connectAgent(env, browser, { clientId });

  const response = await fetch(`${env.url}/api/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query: "query { company { id } }" }),
  });

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});
