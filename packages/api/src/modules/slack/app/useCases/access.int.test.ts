import { expect, NON_OWNER, slackUseCases, test } from "#test/support";

import type { SecurityContext } from "../../../../core/security";

type SlackUseCases = ReturnType<typeof slackUseCases>;

const calls = {
  beginSlackConnection: (slack, ctx) =>
    slack.beginSlackConnection(ctx, "https://example.com/callback"),
  getSlackConnection: (slack, ctx) => slack.getSlackConnection(ctx),
  readSlackMembers: (slack, ctx) => slack.readSlackMembers(ctx, { knownPhotos: new Map() }),
} satisfies Record<
  Exclude<keyof SlackUseCases, "finishSlackConnection">,
  (slack: SlackUseCases, ctx: SecurityContext) => unknown
>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const slack = slackUseCases(orm);

    await expect(async () => {
      await call(slack, NON_OWNER);
    }).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
