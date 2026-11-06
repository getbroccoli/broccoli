import { expect } from "vitest";

import type { Browser } from "./browser";

/** Chooses the agent and issues a code through the setup holder's GraphQL session. */
export async function createExternalAgentCode(browser: Browser): Promise<string> {
  const chosen = await browser.graphql("mutation { externalAgents { choose { setup { id } } } }");
  expect(await chosen.json()).toEqual({
    data: { externalAgents: { choose: { setup: { id: "instance" } } } },
  });
  const response = await browser.graphql(
    `mutation {
    externalAgents { createCode {
      externalAgentCode { code expiresAt }
      error { __typename ... on ConflictError { message } }
    } }
  }`,
  );
  const body = (await response.json()) as {
    data: {
      externalAgents: {
        createCode: {
          externalAgentCode: { code: string; expiresAt: string };
          error: unknown;
        };
      };
    };
  };
  expect(body.data.externalAgents.createCode.error).toBeNull();
  expect(body.data.externalAgents.createCode.externalAgentCode.code).toMatch(/^[\w-]{43}$/);
  expect(body.data.externalAgents.createCode.externalAgentCode.expiresAt).toBeTypeOf("string");
  return body.data.externalAgents.createCode.externalAgentCode.code;
}

/** Exchanges the code over HTTP and returns the token for subsequent agent requests. */
export async function exchangeExternalAgentCode(url: string, code: string): Promise<string> {
  const response = await fetch(`${url}/api/external-agent/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, client: "Test agent" }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = (await response.json()) as { token: string; expiresAt: string };
  expect(body.token).toMatch(/^[\w-]{43}$/);
  expect(body.expiresAt).toBeTypeOf("string");
  return body.token;
}
