import { expect, OWNER, slackUseCases, test } from "#test/support";

test("recognises the connection from a member read", async ({ orm, seed, transact }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, { slackApi: { listMembers: () => Promise.resolve([]) } });
  const { snapshot } = await slack.readSlackMembers(OWNER);

  const current = await transact((tx) => slack.isCurrentSlackConnection(OWNER, tx, snapshot));

  expect(current).toBe(true);
});

test("rejects a snapshot after reconnecting the same workspace with the same token", async ({
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
  const { snapshot } = await slack.readSlackMembers(OWNER);
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

  const current = await transact((tx) => slack.isCurrentSlackConnection(OWNER, tx, snapshot));

  expect(current).toBe(false);
});
