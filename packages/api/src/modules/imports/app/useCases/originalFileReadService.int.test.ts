import {
  expect,
  importUseCases,
  SETUP_HOLDER,
  SYSTEM,
  test,
  STAFF_CSV as CSV,
  READ_PEOPLE as PEOPLE,
  externalAgentUseCases,
  SETUP_EXTERNAL_AGENT,
  storedFileIds,
  STAFF_PDF as PDF,
} from "#test/support";

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

test("a PDF uploaded to the import waits for consent without a job", async ({ orm }) => {
  const imports = importUseCases(orm);

  const id = await imports.files.uploadFile(SETUP_HOLDER, { name: "staff.pdf", bytes: PDF });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id, status: "waiting_for_original_read_consent", originalReadAllowedAt: null },
  ]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses a PDF name whose bytes are not a PDF", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(
    imports.files.uploadFile(SETUP_HOLDER, { name: "staff.pdf", bytes: Buffer.from(CSV) }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "file", code: "unsupported_file" }],
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("refuses a non-PDF dropped under a PDF name for the agent", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);

  await expect(
    agents.files.uploadForExternalAgent(SETUP_HOLDER, {
      name: "staff.pdf",
      bytes: Buffer.from(CSV),
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "file", code: "unsupported_file" }],
  });

  expect(await storedFileIds(orm)).toEqual([]);
});

test("consent with Broccoli queues a new read and keeps the existing records", async ({
  orm,
  seed,
}) => {
  await seed.aiSource("broccoli_ai");
  const source = await seed.fileSource({
    content: CSV,
    status: "mapped",
    readBy: "answered_by_external_agent",
  });
  await seed.importEmployees(source.id, [{ firstName: "Avery", email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });

  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    {
      id: source.id,
      status: "mapping",
      readBy: "parsed_by_broccoli",
      originalReadAllowedAt: expect.any(Date) as unknown,
      failure: null,
      pickedUpByExternalAgentAt: null,
    },
  ]);
  expect(imports.sentJobs).toEqual([
    {
      name: "imports.readOriginalFile",
      payload: { sourceId: source.id, attempt: 1, aiSource: "broccoli_ai" },
    },
  ]);
  expect(await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id })).toEqual(
    records,
  );
});

test("consent uses the agent chosen now and clears the previous failure", async ({
  orm,
  seed,
  transact,
}) => {
  const source = await seed.fileSource({
    content: CSV,
    status: "failed",
    failure: "no_people_columns",
  });
  await seed.aiSource("external_agent");
  const imports = importUseCases(orm);

  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id);

  expect(
    await transact((tx) => imports.answeredMapping.readUnmappedSources(SETUP_EXTERNAL_AGENT, tx)),
  ).toEqual([{ id: source.id, way: "read_original_file" }]);
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    {
      id: source.id,
      status: "mapping",
      readBy: "answered_by_external_agent",
      failure: null,
      originalReadAllowedAt: expect.any(Date) as unknown,
    },
  ]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses consent while the file is still mapping", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: CSV });
  const imports = importUseCases(orm);

  await expect(
    imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Wait until the file is read.",
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([source]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses a second consent", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm, {
    originalFileReader: { readOriginalFile: () => Promise.resolve(PEOPLE) },
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id);
  await imports.originalFileReads.readOriginalFile(SYSTEM, {
    sourceId: source.id,
    attempt: 1,
    aiSource: null,
  });
  const before = await imports.reads.listSources(SETUP_HOLDER);

  await expect(
    imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "AI may already read this file.",
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual(before);
  expect(imports.sentJobs).toHaveLength(1);
});

test("refuses consent for a Slack source", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const imports = importUseCases(orm);

  await expect(
    imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This file is gone.",
  });
});

test("refuses consent for a missing source", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(
    imports.originalFileReads.allowOriginalFileRead(
      SETUP_HOLDER,
      "0199f6c4-0000-7000-8000-000000000000",
    ),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "This file is gone.",
  });
});

test("refuses consent from the external agent", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);

  await expect(
    imports.originalFileReads.allowOriginalFileRead(SETUP_EXTERNAL_AGENT, source.id),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([source]);
  expect(imports.sentJobs).toEqual([]);
});
