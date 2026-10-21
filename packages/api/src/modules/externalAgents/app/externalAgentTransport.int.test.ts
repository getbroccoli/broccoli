import { expect, externalAgentUseCases, SETUP_HOLDER, test } from "#test/support";

test.for([
  "https://example.com",
  "https://broccoli.example.com:8443",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
])("allows a code on %s", async (origin, { orm, seed }) => {
  await seed.externalAgentSetup();
  const { sessions } = externalAgentUseCases(orm);

  const issued = await sessions.createExternalAgentCode(SETUP_HOLDER, { origin });

  expect(issued.code).toMatch(/^[\w-]{43}$/);
});

test.for(["http://example.com", "http://localhost.example.com", "http://127.0.0.1.example.com"])(
  "refuses a code on insecure %s",
  async (origin, { orm, seed }) => {
    await seed.externalAgentSetup();
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createExternalAgentCode(SETUP_HOLDER, { origin })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Your agent needs Broccoli on https or on this computer.",
    });
  },
);

test.for(["", "null", "not an origin", "https://", "file:///tmp/staff"])(
  "refuses a code without an HTTP origin (%s)",
  async (origin, { orm, seed }) => {
    await seed.externalAgentSetup();
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createExternalAgentCode(SETUP_HOLDER, { origin })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  },
);
