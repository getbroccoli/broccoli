import { expect, OWNER, slackServices, test } from "#test/support";

test("returns null before Slack is connected", async ({ orm }) => {
  expect(await slackServices(orm).getSlackConnection(OWNER)).toBeNull();
});

test("returns the workspace without its token", async ({ orm, seed }) => {
  await seed.slackConnection();

  expect(await slackServices(orm).getSlackConnection(OWNER)).toEqual({
    teamId: "T1",
    teamName: "Acme Workspace",
  });
});
