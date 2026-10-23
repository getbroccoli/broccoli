import { approveReviewedImport, expect, test } from "#test/support";

test("the setup holder resets the account step through the import mutation", async ({ env }) => {
  const browser = await env.startSetupAtImport();
  const source = await env.seed.importSource();
  await env.seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const approval = await approveReviewedImport(browser);
  expect(await approval.json()).toEqual({
    data: { approveImport: { import: { id: "import" }, error: null } },
  });

  const response = await browser.graphql(`mutation {
  resetSetup { import { id } }
}`);

  expect(await response.json()).toEqual({
    data: { resetSetup: { import: { id: "import" } } },
  });
  expect(response.status).toBe(200);
  const setup = await browser.graphql("query { setup { id step } }");
  expect(await setup.json()).toEqual({
    data: { setup: { id: "instance", step: "COMPANY" } },
  });
});
