import {
  expect,
  externalAgentUseCases,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

test("refuses people from a masked-way session", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, {
    way: "answers_masked_questions",
    origin: "http://localhost:8080",
  });
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;

  await expect(
    agents.parsedWay.importPeople(ctx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com" }],
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Your agent's session works the other way.",
  });

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toEqual([]);
});

test("refuses people from a disconnected parsed-way session", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, {
    way: "parses_original_files",
    origin: "http://localhost:8080",
  });
  const { token } = await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;
  await agents.sessions.disconnectAgent(SETUP_HOLDER);

  await expect(
    agents.parsedWay.importPeople(ctx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com" }],
    }),
  ).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Your agent's session ended.",
  });

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toEqual([]);
});
