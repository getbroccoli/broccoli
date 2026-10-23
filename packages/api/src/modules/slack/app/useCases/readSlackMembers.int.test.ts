import { expect, OWNER, slackUseCases, test } from "#test/support";

import { createSecretBox } from "../../../../core/secrets";

test("refuses to read members before Slack is connected", async ({ orm }) => {
  await expect(
    slackUseCases(orm).readSlackMembers(OWNER, { knownPhotos: new Map() }),
  ).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Slack is not connected.",
  });
});

test("returns only the workspace's people", async ({ orm, seed }) => {
  await seed.slackConnection();
  const members = [
    { id: "U1", profile: { email: "avery@example.com" } },
    { id: "U2", deleted: true, profile: { email: "deleted@example.com" } },
    { id: "U3", is_bot: true, profile: { email: "bot@example.com" } },
    { id: "U4", is_app_user: true, profile: { email: "app@example.com" } },
    { id: "U5", is_restricted: true, profile: { email: "guest@example.com" } },
    { id: "U6", is_ultra_restricted: true, profile: { email: "guest2@example.com" } },
    { id: "U7" },
  ];
  const slack = slackUseCases(orm, {
    slackApi: {
      listMembers: (token) => {
        expect(token).toBe("test-slack-token");
        return Promise.resolve(members);
      },
    },
  });

  const result = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(result.workspace).toEqual({ id: "T1", name: "Acme Workspace" });
  expect(result.members).toEqual([
    { ...members[0], photo: null },
    { id: "U7", photo: null },
  ]);
});

test("reports a failed Slack read as unavailable", async ({ orm, seed }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { listMembers: () => Promise.reject(new Error("Slack unavailable")) },
  });

  await expect(slack.readSlackMembers(OWNER, { knownPhotos: new Map() })).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });
});

test("reports a token that cannot be decrypted as unavailable", async ({ orm, seed }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    secretBox: createSecretBox(Buffer.alloc(32, 7).toString("base64url")),
    slackApi: { listMembers: () => Promise.resolve([]) },
  });

  await expect(slack.readSlackMembers(OWNER, { knownPhotos: new Map() })).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });
});

test("is current right after the read", async ({ orm, seed, transact }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, { slackApi: { listMembers: () => Promise.resolve([]) } });
  const read = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  const current = await transact((tx) => read.isStillCurrent(tx));

  expect(current).toBe(true);
});

test("is no longer current after reconnecting the same workspace with the same token", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { listMembers: () => Promise.resolve([]) },
    slackAuthorization: {
      exchange: () =>
        Promise.resolve({
          accessToken: "test-slack-token",
          scopes: ["users:read", "users:read.email"],
          team: { id: "T1", name: "Acme Workspace" },
        }),
    },
  });
  const read = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });
  const { authorizeUrl, pendingToken } = slack.beginSlackConnection(
    OWNER,
    "https://example.com/callback",
  );
  expect(
    await slack.finishSlackConnection(OWNER, {
      pendingToken,
      state: authorizeUrl.searchParams.get("state")!,
      code: "test-code",
      error: undefined,
    }),
  ).toBeNull();

  const current = await transact((tx) => read.isStillCurrent(tx));

  expect(current).toBe(false);
});
