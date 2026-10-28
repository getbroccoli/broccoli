import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { vi } from "vitest";

import {
  expect,
  EMPLOYEE,
  OWNER,
  SYSTEM,
  slackUseCases,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

import type { SlackAuthorization } from "../../../../integrations/slack";

test("begins authorization with the callback, state and challenge", ({ orm }) => {
  const slack = slackUseCases(orm);
  const returnTo = "https://example.com/api/integrations/slack/callback";

  const { authorizeUrl, pendingToken } = slack.beginSlackConnection(OWNER, returnTo);

  expect(pendingToken).toEqual(expect.any(String));
  expect(pendingToken).not.toBe("");
  expect(authorizeUrl.searchParams.get("return_to")).toBe(returnTo);
  expect(authorizeUrl.searchParams.get("state")).toEqual(expect.stringMatching(/\S+/));
  expect(authorizeUrl.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test.for([
  { name: "mismatched state", input: { state: "wrong-state" }, outcome: "state" },
  { name: "missing state", input: { state: undefined }, outcome: "state" },
  { name: "missing pending token", input: { pendingToken: undefined }, outcome: "state" },
  { name: "empty pending token", input: { pendingToken: "" }, outcome: "state" },
  {
    name: "malformed pending token",
    input: { pendingToken: "malformed", state: "malformed" },
    outcome: "state",
  },
  { name: "cancelled authorization", input: { error: "access_denied" }, outcome: "cancelled" },
  { name: "provider error", input: { error: "server_error" }, outcome: "failed" },
  { name: "missing code", input: { code: undefined }, outcome: "failed" },
])(
  "returns $outcome for $name without exchanging or storing",
  async ({ input, outcome }, { orm }) => {
    const exchange = vi.fn<SlackAuthorization["exchange"]>();
    const slack = slackUseCases(orm, { slackAuthorization: { exchange } });
    const callback = beginConnection(slack);

    expect(await slack.finishSlackConnection(OWNER, { ...callback, ...input })).toBe(outcome);

    expect(exchange).not.toHaveBeenCalled();
    expect(await slack.getSlackConnection(OWNER)).toBeNull();
  },
);

test("returns state for an employee without exchanging or storing", async ({ orm }) => {
  const exchange = vi.fn<SlackAuthorization["exchange"]>();
  const slack = slackUseCases(orm, { slackAuthorization: { exchange } });
  const callback = beginConnection(slack);

  expect(await slack.finishSlackConnection(EMPLOYEE, callback)).toBe("state");

  expect(exchange).not.toHaveBeenCalled();
  expect(await slack.getSlackConnection(OWNER)).toBeNull();
});

test("returns failed and stores nothing when the exchange fails", async ({ orm }) => {
  const exchange = vi
    .fn<SlackAuthorization["exchange"]>()
    .mockRejectedValue(new Error("Relay unavailable"));
  const slack = slackUseCases(orm, { slackAuthorization: { exchange } });
  const callback = beginConnection(slack);

  expect(await slack.finishSlackConnection(OWNER, callback)).toBe("failed");

  expect(exchange).toHaveBeenCalledOnce();
  expect(await slack.getSlackConnection(OWNER)).toBeNull();
});

test.for(["users:read", "users:read.email"])(
  "returns failed and stores nothing without the %s scope",
  async (missingScope, { orm }) => {
    const slack = slackUseCases(orm, {
      slackAuthorization: {
        exchange: () =>
          Promise.resolve({
            ...GRANT,
            scopes: GRANT.scopes.filter((scope) => scope !== missingScope),
          }),
      },
    });
    const callback = beginConnection(slack);

    expect(await slack.finishSlackConnection(OWNER, callback)).toBe("failed");

    expect(await slack.getSlackConnection(OWNER)).toBeNull();
  },
);

test.for([
  { name: "owner", ctx: OWNER },
  { name: "system", ctx: SYSTEM },
])(
  "connects as $name using the S256 verifier and stores the token encrypted",
  async ({ ctx }, { orm }) => {
    const exchange = vi.fn<SlackAuthorization["exchange"]>().mockResolvedValue(GRANT);
    const slack = slackUseCases(orm, { slackAuthorization: { exchange } });
    const { authorizeUrl, pendingToken } = slack.beginSlackConnection(
      ctx,
      "https://example.com/callback",
    );

    expect(
      await slack.finishSlackConnection(ctx, {
        pendingToken,
        state: authorizeUrl.searchParams.get("state")!,
        code: "test-code",
        error: undefined,
      }),
    ).toBeNull();

    expect(exchange).toHaveBeenCalledOnce();
    const { code, codeVerifier } = exchange.mock.calls[0]![0];
    expect(code).toBe("test-code");
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(authorizeUrl.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(codeVerifier).digest("base64url"),
    );
    expect(await slack.getSlackConnection(OWNER)).toEqual({
      teamId: "T1",
      teamName: "Acme Workspace",
    });
    const stored = await orm.execute<{ encrypted_token: string }>(
      sql`select encrypted_token from slack_connection`,
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.encrypted_token).not.toContain(GRANT.accessToken);
    expect(TEST_SECRET_BOX.decrypt(stored.rows[0]!.encrypted_token)).toBe(GRANT.accessToken);
  },
);

test("propagates unexpected database failures", async ({ orm }) => {
  const slack = slackUseCases(orm, {
    slackAuthorization: { exchange: () => Promise.resolve(GRANT) },
  });
  const callback = beginConnection(slack);
  await orm.execute(sql`drop table slack_connection`);

  await expect(slack.finishSlackConnection(OWNER, callback)).rejects.toThrow();
});

const GRANT = {
  accessToken: "test-private-slack-token",
  scopes: ["users:read", "users:read.email"],
  team: { id: "T1", name: "Acme Workspace" },
};

function beginConnection(slack: ReturnType<typeof slackUseCases>) {
  const { authorizeUrl, pendingToken } = slack.beginSlackConnection(
    OWNER,
    "https://example.com/callback",
  );
  return {
    pendingToken,
    state: authorizeUrl.searchParams.get("state")!,
    code: "test-code",
    error: undefined,
  };
}
