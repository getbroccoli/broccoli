import { expect, NON_OWNER, slackUseCases, test } from "#test/support";

import type { Tx } from "../../../../core/db";
import type { SecurityContext } from "../../../../core/security";

type SlackUseCases = ReturnType<typeof slackUseCases>;

const calls = {
  beginSlackConnection: (slack, ctx) =>
    slack.beginSlackConnection(ctx, "https://example.com/callback"),
  getSlackConnection: (slack, ctx) => slack.getSlackConnection(ctx),
  readSlackMembers: (slack, ctx) => slack.readSlackMembers(ctx),
  isCurrentSlackConnection: (slack, ctx, tx) =>
    slack.isCurrentSlackConnection(ctx, tx, "test-snapshot"),
  readSlackPhoto: (slack, ctx) =>
    slack.readSlackPhoto(ctx, new URL("https://avatars.slack-edge.com/photo.jpg")),
} satisfies Record<
  Exclude<keyof SlackUseCases, "finishSlackConnection">,
  (slack: SlackUseCases, ctx: SecurityContext, tx: Tx) => unknown
>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm, transact }) => {
    const slack = slackUseCases(orm);

    await expect(
      transact(async (tx) => {
        await call(slack, NON_OWNER, tx);
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
