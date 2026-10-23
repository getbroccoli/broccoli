import { expect, signInAsManagedOwner, startManagedEnv, test } from "#test/support";

test("a managed owner resets setup through the API and stays signed in", async () => {
  const { env, accounts } = await startManagedEnv();
  const browser = await signInAsManagedOwner(env, accounts);
  await env.seed.setupStep("done");
  const before = await browser.graphql("query { me { id isOwner } }");
  const signedIn = (await before.json()) as { data: { me: { id: string; isOwner: boolean } } };
  expect(signedIn).not.toHaveProperty("errors");
  expect(signedIn.data.me.id).toEqual(expect.any(String));
  expect(signedIn.data.me.isOwner).toBe(true);

  const response = await browser.graphql(resetSetup);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    data: { setup: { reset: { setup: { id: "instance", step: "COMPANY" }, error: null } } },
  });
  const after = await browser.graphql("query { me { id isOwner } }");
  expect(await after.json()).toEqual({ data: { me: signedIn.data.me } });
});

test("refuses resetting setup without a session", async ({ env }) => {
  const response = await env.browser().graphql(resetSetup);

  expect(await response.json()).toMatchObject({
    errors: [{ extensions: { code: "UNAUTHENTICATED" } }],
  });
});

const resetSetup = `mutation {
  setup {
    reset {
      setup { id step }
      error { __typename ... on Error { message } }
    }
  }
}`;
