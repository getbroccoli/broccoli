import { expect, OWNER, slackUseCases, test } from "#test/support";

import { createSecretBox } from "../../../../core/secrets";

test("refuses to read members before Slack is connected", async ({ orm }) => {
  await expect(slackUseCases(orm).readSlackMembers(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Slack is not connected.",
  });
});

test("returns the workspace, unfiltered members and a connection snapshot", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const members = [
    { id: "U1", profile: { email: "avery@example.com" } },
    { id: "U2", is_bot: true },
  ];
  const slack = slackUseCases(orm, {
    slackApi: {
      listMembers: (token) => {
        expect(token).toBe("test-slack-token");
        return Promise.resolve(members);
      },
    },
  });

  const result = await slack.readSlackMembers(OWNER);

  expect(result).toMatchObject({ workspace: { id: "T1", name: "Acme Workspace" }, members });
});

test("reports a failed Slack read as unavailable", async ({ orm, seed }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { listMembers: () => Promise.reject(new Error("Slack unavailable")) },
  });

  await expect(slack.readSlackMembers(OWNER)).rejects.toMatchObject({
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

  await expect(slack.readSlackMembers(OWNER)).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });
});
