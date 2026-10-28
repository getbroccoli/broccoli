import { expect, EMPLOYEE, slackUseCases, test } from "#test/support";

import type { Transact } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";

type SlackUseCases = ReturnType<typeof slackUseCases>;

const calls = {
  beginSlackConnection: (slack, ctx) =>
    slack.beginSlackConnection(ctx, "https://example.com/callback"),
  disconnectSlack: (slack, ctx, transact) => transact((tx) => slack.disconnectSlack(ctx, tx)),
  getSlackConnection: (slack, ctx) => slack.getSlackConnection(ctx),
  readSlackMembers: (slack, ctx) => slack.readSlackMembers(ctx, { knownPhotos: new Map() }),
} satisfies Record<
  Exclude<keyof SlackUseCases, "finishSlackConnection">,
  (slack: SlackUseCases, ctx: SecurityContext, transact: Transact) => unknown
>;

test.for(Object.entries(calls))("%s refuses an employee", async ([, call], { orm, transact }) => {
  const slack = slackUseCases(orm);

  await expect(async () => {
    await call(slack, EMPLOYEE, transact);
  }).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only admins can do this.",
    fieldErrors: [],
  });
});
