import { expect, test } from "#test/support";

test("the setup holder resets the account step through the import mutation", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const source = await env.seed.importSource();
  await env.seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const approval = await browser.graphql(`mutation {
    import { approve { import { id } error { __typename ... on Error { message } } } }
  }`);
  expect(await approval.json()).toEqual({
    data: { import: { approve: { import: { id: "import" }, error: null } } },
  });

  const response = await browser.graphql(`mutation {
    import { resetSetup { import { id } } }
  }`);

  expect(await response.json()).toEqual({
    data: { import: { resetSetup: { import: { id: "import" } } } },
  });
  expect(response.status).toBe(200);
  const setup = await browser.graphql("query { setup { id step } }");
  expect(await setup.json()).toEqual({
    data: { setup: { id: "instance", step: "COMPANY" } },
  });
});
