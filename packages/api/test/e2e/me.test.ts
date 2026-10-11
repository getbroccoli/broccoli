import { expect, TEST_OWNER, test } from "#test/support";

const query = "{ me { id email isOwner } }";

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

test("returns no current user after logout", async ({ env }) => {
  const { browser } = await env.signInAsOwner();

  await browser.post("/api/auth/sign-out", {});
  const response = await browser.graphql(query);

  expect(await response.json()).toEqual({ data: { me: null } });
});
