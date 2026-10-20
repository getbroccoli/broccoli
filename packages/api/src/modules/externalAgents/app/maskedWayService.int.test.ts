import {
  expect,
  externalAgentUseCases,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

test.for(["listWaiting", "readQuestions", "answer"] as const)(
  "%s refuses a parsed-way session",
  async (operation, { orm, seed }) => {
    await seed.agentSetup();
    const agents = externalAgentUseCases(orm);
    const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, {
      way: "parses_original_files",
      origin: "http://localhost:8080",
    });
    const { token } = await agents.sessions.startAgentSession(SYSTEM, {
      code,
      client: "Test agent",
    });
    const ctx = (await agents.sessions.readAgentSession({ token }))!;
    const calls = {
      listWaiting: () => agents.maskedWay.listWaiting(ctx),
      readQuestions: () => agents.maskedWay.readQuestions(ctx, "missing"),
      answer: () => agents.maskedWay.answer(ctx, "missing", { sheets: [] }),
    };

    await expect(calls[operation]()).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Your agent's session works the other way.",
    });
  },
);

test("refuses a drop while a parsed-way session is live", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createAgentCode(SETUP_HOLDER, {
    way: "parses_original_files",
    origin: "http://localhost:8080",
  });
  await agents.sessions.startAgentSession(SYSTEM, { code, client: "Test agent" });

  await expect(agents.maskedWay.uploadForAgent(SETUP_HOLDER, CSV)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect(agents.sentJobs).toEqual([]);
});

test("refuses a drop when another AI source is chosen", async ({ orm, seed }) => {
  await seed.agentSetup();
  await seed.aiSource("broccoli_ai");
  const agents = externalAgentUseCases(orm);

  await expect(agents.maskedWay.uploadForAgent(SETUP_HOLDER, CSV)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toEqual([]);
});

test("queues no model job for a dropped file", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);

  const id = await agents.maskedWay.uploadForAgent(SETUP_HOLDER, CSV);

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id, status: "mapping", readBy: "answered_by_external_agent" },
  ]);
  expect(agents.sentJobs).toEqual([]);
});

test("lets a later session answer a file dropped before it connected", async ({ orm, seed }) => {
  await seed.agentSetup();
  const agents = externalAgentUseCases(orm);
  const first = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  await agents.sessions.startAgentSession(SYSTEM, { code: first.code, client: "First agent" });
  const id = await agents.maskedWay.uploadForAgent(SETUP_HOLDER, CSV);
  await agents.sessions.disconnectAgent(SETUP_HOLDER);
  const next = await agents.sessions.createAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startAgentSession(SYSTEM, {
    code: next.code,
    client: "Next agent",
  });
  const ctx = (await agents.sessions.readAgentSession({ token }))!;
  expect(await agents.maskedWay.listWaiting(ctx)).toEqual([
    { id, status: "mapping", failure: null, people: 0 },
  ]);

  const result = await agents.maskedWay.answer(ctx, id, {
    sheets: [
      {
        sheet: 1,
        answers: {
          headerRow: "1",
          fullName: "A",
          firstName: "none",
          lastName: "none",
          email: "B",
          jobTitle: "none",
          startDate: "none",
        },
      },
    ],
  });

  expect(result).toEqual({ status: "mapped", failure: null, people: 1 });
  expect(await agents.maskedWay.listWaiting(ctx)).toEqual([]);
});

const CODE = { way: "answers_masked_questions", origin: "http://localhost:8080" } as const;
const CSV = { name: "staff.csv", bytes: Buffer.from("Name,Email\nAvery Stone,avery@example.com") };
