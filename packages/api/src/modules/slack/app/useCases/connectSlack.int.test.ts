import { sql } from "drizzle-orm";

import { expect, OWNER, slackUseCases, test, TEST_ENCRYPTION } from "#test/support";

test("connects the workspace and stores its token encrypted", async ({ orm }) => {
  const token = "test-private-slack-token";
  const slack = slackUseCases(orm, {
    slackAuthorization: {
      exchange: (params) => {
        expect(params).toEqual({ code: "test-code", codeVerifier: "test-verifier" });
        return Promise.resolve({
          accessToken: token,
          scopes: ["users:read", "users:read.email"],
          team: { id: "T1", name: "Acme Workspace" },
        });
      },
    },
  });

  await slack.connectSlack(OWNER, { code: "test-code", codeVerifier: "test-verifier" });

  expect(await slack.getSlackConnection(OWNER)).toEqual({
    teamId: "T1",
    teamName: "Acme Workspace",
  });
  const stored = await orm.execute<{ encrypted_token: string }>(
    sql`select encrypted_token from slack_connection`,
  );
  expect(stored.rows).toHaveLength(1);
  expect(stored.rows[0]!.encrypted_token).not.toContain(token);
  expect(TEST_ENCRYPTION.decrypt(stored.rows[0]!.encrypted_token)).toBe(token);
});

test.for(["exchange", "users:read", "users:read.email"])(
  "stores nothing when connecting fails at %s",
  async (failure, { orm }) => {
    const slack = slackUseCases(orm, {
      slackAuthorization: {
        exchange: () => {
          if (failure === "exchange") return Promise.reject(new Error("Relay unavailable"));
          return Promise.resolve({
            accessToken: "test-slack-token",
            scopes: ["users:read", "users:read.email"].filter((scope) => scope !== failure),
            team: { id: "T1", name: "Acme Workspace" },
          });
        },
      },
    });

    await expect(
      slack.connectSlack(OWNER, { code: "test-code", codeVerifier: "test-verifier" }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Could not connect Slack." });

    expect(await slack.getSlackConnection(OWNER)).toBeNull();
    expect((await orm.execute(sql`select * from slack_connection`)).rows).toEqual([]);
  },
);
