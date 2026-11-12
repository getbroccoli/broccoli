import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

import type { Browser } from "./browser";
import type { TestEnv } from "./testEnv";

export async function registerAgentClient(env: TestEnv, name: string): Promise<string> {
  const response = await fetch(`${env.url}/api/auth/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: ["http://127.0.0.1:33418/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert(response.ok, `Client registration failed with ${response.status}`);
  const client = (await response.json()) as { client_id: string };
  assert(client.client_id);
  return client.client_id;
}

export async function connectAgent(
  env: TestEnv,
  browser: Browser,
  options: { clientId: string; scope?: string; resource?: string },
): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const { code, verifier, resource } = await authorizeAgent(env, browser, options);
  const response = await exchangeAgentCode(env, {
    clientId: options.clientId,
    code,
    verifier,
    resource,
  });
  assert.equal(response.status, 200);
  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    scope: string;
  };
  assert(tokens.access_token);
  assert(tokens.refresh_token);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
  };
}

export async function authorizeAgent(
  env: TestEnv,
  browser: Browser,
  {
    clientId,
    scope = "broccoli:read offline_access",
    resource = `${env.url}/api/mcp`,
  }: { clientId: string; scope?: string; resource?: string },
): Promise<{ code: string; verifier: string; resource: string }> {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://127.0.0.1:33418/callback",
    scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource,
  });
  const location = await authorize(env, browser, params);
  assert.equal(location.pathname, "/api/auth/agent/allow");
  const consent = await browser.post("/api/auth/oauth2/consent", {
    accept: true,
    oauth_query: location.search.slice(1),
  });
  assert.equal(consent.status, 200);
  const approved = (await consent.json()) as { redirect: boolean; url: string };
  assert.equal(approved.redirect, true);
  const callback = new URL(approved.url);
  assert.equal(callback.origin + callback.pathname, "http://127.0.0.1:33418/callback");
  assert.equal(callback.searchParams.get("state"), state);
  const code = callback.searchParams.get("code");
  assert(code);
  return { code, verifier, resource };
}

export function exchangeAgentCode(
  env: TestEnv,
  {
    clientId,
    code,
    verifier,
    resource,
  }: { clientId: string; code: string; verifier: string; resource: string },
): Promise<Response> {
  return fetch(`${env.url}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:33418/callback",
      client_id: clientId,
      code_verifier: verifier,
      resource,
    }),
  });
}

export function refreshAgent(
  env: TestEnv,
  {
    clientId,
    refreshToken,
    resource = `${env.url}/api/mcp`,
  }: { clientId: string; refreshToken: string; resource?: string },
): Promise<Response> {
  return fetch(`${env.url}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
      resource,
    }),
  });
}

export function callMcpTool(
  env: TestEnv,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Response> {
  return fetch(`${env.url}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

/**
 * Where the authorize endpoint sends the browser. A test's fetch is never a navigation, so the
 * endpoint answers with the redirect as JSON, as it does for a page's fetch.
 */
export async function authorize(
  env: TestEnv,
  browser: Browser,
  params: URLSearchParams,
): Promise<URL> {
  const response = await browser.get(`/api/auth/oauth2/authorize?${params.toString()}`);
  assert.equal(response.status, 200);
  const { url } = (await response.json()) as { url: string };
  return new URL(url, env.url);
}
