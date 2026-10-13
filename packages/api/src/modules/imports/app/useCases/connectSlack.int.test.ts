import { sql } from "drizzle-orm";

import { expect, importUseCases, OWNER, test } from "#test/support";

import { createEncryption } from "../../../../core/secrets";
import type { SlackClient } from "../../../../integrations/slack";

test("connects the workspace and imports its members", async ({ orm }) => {
  const imports = importUseCases(orm, {
    slack: {
      redeem: () =>
        Promise.resolve({
          accessToken: "test-slack-token",
          scopes: ["users:read", "users:read.email"],
          team: { id: "T1", name: "Acme Workspace" },
        }),
      listMembers: () =>
        Promise.resolve([
          {
            id: "U1",
            profile: { first_name: "Avery", last_name: "Stone", email: "avery@example.com" },
          },
        ]),
    },
  });

  await imports.connectSlack(OWNER, { handle: "test-handle", codeVerifier: "test-verifier" });

  const sources = await imports.listSources(OWNER);
  expect(sources).toMatchObject([{ kind: "slack", name: "Acme Workspace" }]);
  expect(sources[0]!.id).toEqual(expect.any(String));
  expect(sources[0]!.readAt).toBeInstanceOf(Date);
  const employees = await imports.listEmployees(OWNER, {});
  expect(employees.edges.map(({ node }) => node)).toMatchObject([
    {
      sourceId: sources[0]!.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
});

test("stores the Slack token encrypted with the instance key", async ({ orm }) => {
  const encryption = createEncryption(Buffer.alloc(32, 7).toString("base64url"));
  const token = "test-private-slack-token";
  const imports = importUseCases(orm, {
    encryption,
    slack: {
      redeem: () =>
        Promise.resolve({
          accessToken: token,
          scopes: ["users:read", "users:read.email"],
          team: { id: "T1", name: "Acme Workspace" },
        }),
      listMembers: () => Promise.resolve([]),
    },
  });

  await imports.connectSlack(OWNER, { handle: "test-handle", codeVerifier: "test-verifier" });

  const stored = await orm.execute<{ encrypted_token: string }>(
    sql`select encrypted_token from slack_connection`,
  );
  expect(stored.rows).toHaveLength(1);
  expect(stored.rows[0]!.encrypted_token).not.toContain(token);
  expect(encryption.decrypt(stored.rows[0]!.encrypted_token)).toBe(token);
});

test("connecting another workspace renames the same source and replaces its employees", async ({
  orm,
  seed,
}) => {
  const original = await seed.importSource();
  await seed.importEmployees(original.id, [{ externalId: "U1", firstName: "Avery" }]);
  await seed.slackConnection();
  const imports = importUseCases(orm, {
    slack: {
      redeem: () =>
        Promise.resolve({
          accessToken: "test-other-token",
          scopes: ["users:read", "users:read.email"],
          team: { id: "T2", name: "Acme Labs" },
        }),
      listMembers: () =>
        Promise.resolve([
          {
            id: "U2",
            profile: { first_name: "Robin", last_name: "Reed", email: "robin@example.com" },
          },
        ]),
    },
  });

  await imports.connectSlack(OWNER, { handle: "other-handle", codeVerifier: "test-verifier" });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: original.id, kind: "slack", name: "Acme Labs" },
  ]);
  const employees = await imports.listEmployees(OWNER, {});
  expect(
    employees.edges.map(({ node }) => ({ sourceId: node.sourceId, email: node.email })),
  ).toEqual([{ sourceId: original.id, email: "robin@example.com" }]);
});

test.for(["redeem", "list", "users:read", "users:read.email"])(
  "stores nothing when connecting fails at %s",
  async (failure, { orm }) => {
    const slack: Partial<SlackClient> = {
      redeem: () => {
        if (failure === "redeem") return Promise.reject(new Error("Relay unavailable"));
        return Promise.resolve({
          accessToken: "test-slack-token",
          scopes: ["users:read", "users:read.email"].filter((scope) => scope !== failure),
          team: { id: "T1", name: "Acme Workspace" },
        });
      },
      listMembers: () => {
        if (failure === "list") return Promise.reject(new Error("Slack unavailable"));
        return Promise.resolve([{ id: "U1", profile: { email: "avery@example.com" } }]);
      },
    };
    const imports = importUseCases(orm, { slack });

    await expect(
      imports.connectSlack(OWNER, { handle: "test-handle", codeVerifier: "test-verifier" }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Could not connect Slack." });

    expect(await imports.listSources(OWNER)).toEqual([]);
    expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
    expect((await orm.execute(sql`select * from slack_connection`)).rows).toEqual([]);
  },
);
