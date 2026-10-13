import { expect, OWNER, slackUseCases, test } from "#test/support";

test("returns null before Slack is connected", async ({ orm }) => {
  expect(await slackUseCases(orm).getSlackConnection(OWNER)).toBeNull();
});

test("returns the workspace without its token", async ({ orm, seed }) => {
  await seed.slackConnection();

  expect(await slackUseCases(orm).getSlackConnection(OWNER)).toEqual({
    teamId: "T1",
    teamName: "Acme Workspace",
  });
});
