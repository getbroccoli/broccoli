import { expect, TEST_OWNER, test } from "#test/support";

const query = "{ me { id email isOwner } }";

test("tells the web app a self-hosted instance signs in with a password", async ({ env }) => {
  const response = await env.browser().graphql("{ setup { signIn } }");

  expect(await response.json()).toEqual({ data: { setup: { signIn: "PASSWORD" } } });
});

test("returns no current user without a session", async ({ env }) => {
  const response = await env.browser().graphql(query);

  expect(await response.json()).toEqual({ data: { me: null } });
});

test("returns the signed-in owner as the current user", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();

  const response = await browser.graphql(query);

  expect(await response.json()).toEqual({
    data: { me: { id: user.id, email: TEST_OWNER.email, isOwner: true } },
  });
});

test("returns the updated email after the owner's email changes", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  const email = "updated.owner@example.com";
  await env.changeUserEmail(user.id, email);

  const response = await browser.graphql("{ me { email } }");

  expect(await response.json()).toEqual({ data: { me: { email } } });
});

test("returns no current user after logout", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  await browser.post("/api/auth/sign-out", {});
  const response = await browser.graphql(query);

  expect(await response.json()).toEqual({ data: { me: null } });
});
