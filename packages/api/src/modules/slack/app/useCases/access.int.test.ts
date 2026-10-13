import { expect, slackUseCases, test } from "#test/support";

import type { Actor } from "../../../../core/actor";

type SlackUseCases = ReturnType<typeof slackUseCases>;

const calls = {
  beginSlackConnection: (slack, actor) =>
    slack.beginSlackConnection(actor, "https://example.com/callback"),
  connectSlack: (slack, actor) =>
    slack.connectSlack(actor, { code: "test-code", codeVerifier: "test-verifier" }),
  getSlackConnection: (slack, actor) => slack.getSlackConnection(actor),
} satisfies Record<
  "beginSlackConnection" | "connectSlack" | "getSlackConnection",
  (slack: SlackUseCases, actor: Actor) => unknown
>;

test.for(Object.entries(calls))(
  "%s refuses a signed-in user who is not the owner",
  async ([, call], { orm }) => {
    const slack = slackUseCases(orm);

    await expect(
      Promise.resolve().then(async () => {
        await call(slack, { userId: "another-user", isOwner: false });
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    });
  },
);
