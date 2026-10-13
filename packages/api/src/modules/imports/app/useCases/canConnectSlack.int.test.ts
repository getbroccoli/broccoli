import { expect, importUseCases, OWNER, test } from "#test/support";

test("can connect Slack when authorization is configured", ({ orm }) => {
  const imports = importUseCases(orm);

  expect(imports.canConnectSlack(OWNER)).toBe(true);
});

test("cannot connect Slack without authorization", ({ orm }) => {
  const imports = importUseCases(orm, { slackAuthorization: null });

  expect(imports.canConnectSlack(OWNER)).toBe(false);
});
