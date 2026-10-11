import { expect, test } from "#test/support";

test("reports the owner step on a fresh instance without a session", async ({ env }) => {
  const response = await env.browser().graphql("query { onboarding { id step } }");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { onboarding: { id: "instance", step: "OWNER" } },
  });
});
