import { expect, externalAgentUseCases, SETUP_HOLDER, test } from "#test/support";

test("allows a code on a safe origin", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);

  const issued = await sessions.createExternalAgentCode(SETUP_HOLDER, {
    origin: "https://example.com",
  });

  expect(issued.code).toMatch(/^[\w-]{43}$/);
});

test("refuses a code on an insecure origin", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);

  await expect(
    sessions.createExternalAgentCode(SETUP_HOLDER, { origin: "http://example.com" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Your agent needs Broccoli on https or on this computer.",
  });
});
