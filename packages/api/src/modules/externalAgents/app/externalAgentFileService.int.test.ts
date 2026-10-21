import {
  expect,
  externalAgentUseCases,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

import { readSetupStep } from "../../../core/instance";

test("refuses a drop when another AI source is chosen", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  await seed.aiSource("broccoli_ai");
  const agents = externalAgentUseCases(orm);

  await expect(agents.files.uploadForExternalAgent(SETUP_HOLDER, CSV)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toEqual([]);
});

test("queues no model job for a dropped file", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);

  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, CSV);

  expect(await importUseCases(orm).reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id, status: "mapping", readBy: "answered_by_external_agent" },
  ]);
  expect(agents.sentJobs).toEqual([]);
});

test("lets a later session answer a file dropped before it connected", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const first = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  await agents.sessions.startExternalAgentSession(SYSTEM, {
    code: first.code,
    client: "First agent",
  });
  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, CSV);
  await agents.sessions.disconnectExternalAgent(SETUP_HOLDER);
  const next = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code: next.code,
    client: "Next agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  expect(await agents.files.listUnansweredFiles(ctx)).toEqual([{ id }]);

  const result = await agents.files.answerMappingQuestions(ctx, id, ANSWERS);

  expect(result).toEqual({ status: "mapped", failure: null, people: 1 });
  expect(await agents.files.listUnansweredFiles(ctx)).toEqual([]);
});

test("writes an answer only before a concurrent Disconnect completes", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, CSV);
  const imports = importUseCases(orm);
  let disconnected = false;

  const [answer, disconnect] = await Promise.allSettled([
    agents.files.answerMappingQuestions(ctx, id, ANSWERS).then((result) => {
      expect(disconnected).toBe(false);
      return result;
    }),
    agents.sessions.disconnectExternalAgent(SETUP_HOLDER).then(() => {
      disconnected = true;
    }),
  ]);

  expect(disconnect.status).toBe("fulfilled");
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id });
  if (answer.status === "fulfilled") {
    expect(answer.value).toEqual({ status: "mapped", failure: null, people: 1 });
    expect(records.edges).toMatchObject([{ node: { email: "avery@example.com" } }]);
    expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([{ id, status: "mapped" }]);
  } else {
    expect(answer.reason).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(records.edges).toEqual([]);
    expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
      { id, status: "mapping" },
    ]);
  }
  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.answerMappingQuestions(ctx, id, ANSWERS)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  expect(await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).toEqual(records);
});

test("refuses stale approval racing an answer and prevents answers after refreshed approval", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER, CODE);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Test agent",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, CSV);
  const imports = importUseCases(orm);
  const review = await imports.reads.readReview(SETUP_HOLDER);

  const [answer, approval] = await Promise.allSettled([
    agents.files.answerMappingQuestions(ctx, id, ANSWERS),
    imports.approveImport(SETUP_HOLDER, review.version),
  ]);

  expect(answer).toMatchObject({
    status: "fulfilled",
    value: { status: "mapped", failure: null, people: 1 },
  });
  // Before the answer, the file is still mapping; after it, the reviewed version is stale.
  expect(approval).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
  expect(await readSetupStep(orm)).toBe("import");
  const refreshed = await imports.reads.readReview(SETUP_HOLDER);
  expect(refreshed.readyEmployees).toHaveLength(1);
  await imports.approveImport(SETUP_HOLDER, refreshed.version);
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id });
  expect(await readSetupStep(orm)).toBe("owner");
  expect(await agents.sessions.readExternalAgentSession({ token })).toBeNull();
  await expect(agents.files.answerMappingQuestions(ctx, id, ANSWERS)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  expect(await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).toEqual(records);
});

const CODE = { origin: "http://localhost:8080" };
const CSV = { name: "staff.csv", bytes: Buffer.from("Name,Email\nAvery Stone,avery@example.com") };
const ANSWERS = {
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
};
