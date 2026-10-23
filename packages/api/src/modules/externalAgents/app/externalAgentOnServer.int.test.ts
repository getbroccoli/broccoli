import {
  aiSettings,
  expect,
  externalAgentUseCases,
  OWNER,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

import { readInstance } from "../../../core/instance";

test.for([SETUP_HOLDER, OWNER])(
  "refuses the server command to a non-system caller without saving a source",
  async (ctx, { orm }) => {
    const { sessions } = externalAgentUseCases(orm);

    await expect(sessions.createExternalAgentCodeOnServer(ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect((await readInstance(orm)).aiSource).toBeNull();
  },
);

test("the server command connects an agent on a fresh instance", async ({ orm }) => {
  const { sessions } = externalAgentUseCases(orm);

  const { code } = await sessions.createExternalAgentCodeOnServer(SYSTEM);
  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });

  expect(await sessions.readExternalAgentSession({ token })).not.toBeNull();
  expect(await aiSettings(orm).read(OWNER)).toEqual({
    source: "external_agent",
    openRouterKey: null,
  });
});

test("an agent connected at the company step lists no unmapped files", async ({ orm }) => {
  const { sessions, files } = externalAgentUseCases(orm);
  const { code } = await sessions.createExternalAgentCodeOnServer(SYSTEM);
  const { token } = await sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await sessions.readExternalAgentSession({ token }))!;

  expect(await files.listUnmappedFiles(ctx)).toEqual([]);
});

test("the server command keeps the AI source the owner saved", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  await seed.aiSource("broccoli_ai");
  const { sessions } = externalAgentUseCases(orm);

  await expect(sessions.createExternalAgentCodeOnServer(SYSTEM)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Choose your agent first.",
  });

  expect(await aiSettings(orm).read(OWNER)).toEqual({ source: "broccoli_ai", openRouterKey: null });
});

test("the server command saves no AI source when the setup session has expired", async ({
  orm,
  seed,
}) => {
  const now = new Date("2026-10-20T12:00:00Z");
  await seed.setupSession({ expiresAt: new Date("2026-10-20T11:59:59Z") });
  const { sessions } = externalAgentUseCases(orm, { clock: () => now });

  await expect(sessions.createExternalAgentCodeOnServer(SYSTEM)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Choose your agent first.",
  });

  expect((await readInstance(orm)).aiSource).toBeNull();
});

test("the server command refuses a code once an owner exists", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  await seed.owner();
  const { sessions } = externalAgentUseCases(orm);

  await expect(sessions.createExternalAgentCodeOnServer(SYSTEM)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Choose your agent first.",
  });
});
