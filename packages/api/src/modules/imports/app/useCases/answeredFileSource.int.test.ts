import {
  externalAgentUseCases,
  SETUP_EXTERNAL_AGENT,
  STAFF_PDF as PDF,
  expect,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

test("retries a waiting answered file through the model with the next attempt", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content: "Name,Email\nAvery Stone,avery@example.com",
    readBy: "answered_by_external_agent",
  });
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.retryFile(SETUP_HOLDER, source.id);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, readBy: "parsed_by_broccoli", status: "mapping" },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId: source.id, attempt: 1 } },
  ]);
  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 1 });
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toMatchObject([
    { node: { values: { email: { value: "avery@example.com" } } } },
  ]);
});

test("a PDF dropped for the agent waits for consent without a job or an unmapped listing", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const imports = importUseCases(orm);

  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, {
    name: "staff.PDF",
    bytes: PDF,
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id, status: "waiting_for_original_read_consent", originalReadAllowedAt: null },
  ]);
  expect(
    await transact((tx) => imports.answeredMapping.readUnmappedSources(SETUP_EXTERNAL_AGENT, tx)),
  ).toEqual([]);
  expect(agents.sentJobs).toEqual([]);
  expect((await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).edges).toEqual(
    [],
  );
  expect(await imports.reads.readProgress(SETUP_HOLDER)).toMatchObject({ reading: false });
});
