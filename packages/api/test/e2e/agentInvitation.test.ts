import { expect, test, TEST_OWNER } from "#test/support";

test("an owner's closed invitation stays closed in another browser", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  const closed = await browser.graphql(
    "mutation { mcpAgents { closeInvitation { agentInvitationClosed } } }",
  );

  expect(await closed.json()).toEqual({
    data: { mcpAgents: { closeInvitation: { agentInvitationClosed: true } } },
  });
  const { browser: secondBrowser } = await env.signIn({
    email: TEST_OWNER.email,
    password: TEST_OWNER.password,
  });
  const invitation = await secondBrowser.graphql("query { agentInvitationClosed }");
  expect(await invitation.json()).toEqual({ data: { agentInvitationClosed: true } });
});
