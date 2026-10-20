import { expect } from "vitest";

import type { Browser } from "./browser";

/** Chooses the agent and issues a code through the setup holder's GraphQL session. */
export async function createAgentCode(browser: Browser, way: string): Promise<string> {
  const chosen = await browser.graphql("mutation { setup { chooseAgent { setup { id } } } }");
  expect(await chosen.json()).toEqual({
    data: { setup: { chooseAgent: { setup: { id: "instance" } } } },
  });
  const response = await browser.graphql(
    `mutation CreateAgentCode($way: AgentWay!) {
    setup { createAgentCode(way: $way) {
      agentCode { code way expiresAt }
      error { __typename ... on ConflictError { message } }
    } }
  }`,
    { way },
  );
  const body = (await response.json()) as {
    data: {
      setup: {
        createAgentCode: {
          agentCode: { code: string; way: string; expiresAt: string };
          error: unknown;
        };
      };
    };
  };
  expect(body.data.setup.createAgentCode.error).toBeNull();
  expect(body.data.setup.createAgentCode.agentCode.code).toMatch(/^[\w-]{43}$/);
  expect(body.data.setup.createAgentCode.agentCode.way).toBe(way);
  expect(body.data.setup.createAgentCode.agentCode.expiresAt).toBeTypeOf("string");
  return body.data.setup.createAgentCode.agentCode.code;
}

/** Exchanges the code over HTTP and returns the token for subsequent agent requests. */
export async function exchangeAgentCode(url: string, code: string, way: string): Promise<string> {
  const response = await fetch(`${url}/api/agent/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, client: "Test agent" }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = (await response.json()) as { token: string; way: string; expiresAt: string };
  expect(body.token).toMatch(/^[\w-]{43}$/);
  expect(body.way).toBe(way);
  expect(body.expiresAt).toBeTypeOf("string");
  return body.token;
}
