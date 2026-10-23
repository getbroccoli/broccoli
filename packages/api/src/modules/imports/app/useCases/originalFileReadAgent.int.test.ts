import {
  importSourceValues,
  expect,
  importUseCases,
  SETUP_HOLDER,
  test,
  STAFF_CSV as CSV,
  READ_PEOPLE as PEOPLE,
  SETUP_EXTERNAL_AGENT,
  STAFF_MAPPING_ANSWERS as ANSWERS,
} from "#test/support";

import { parseReadPeople } from "../../domain";

test("the agent cannot fetch an original without consent", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.originalFileReads.readOriginalBytes(SETUP_EXTERNAL_AGENT, tx, source.id),
    ),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No file waits for your answers with this id.",
  });
});

test("fetching a consented original returns its bytes and records the first pickup", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");

  const file = await transact((tx) =>
    imports.originalFileReads.readOriginalBytes(SETUP_EXTERNAL_AGENT, tx, source.id),
  );

  expect(file).toEqual({ content: Buffer.from(CSV), mimeType: "text/csv" });
  const pickedUp = await imports.reads.listSources(SETUP_HOLDER);
  expect(pickedUp).toMatchObject([
    { id: source.id, pickedUpByExternalAgentAt: expect.any(Date) as unknown },
  ]);
  await transact((tx) =>
    imports.originalFileReads.readOriginalBytes(SETUP_EXTERNAL_AGENT, tx, source.id),
  );
  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toEqual(
    pickedUp.map(importSourceValues),
  );
});

test("the agent cannot fetch an original assigned to Broccoli even with consent", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.aiSource("broccoli_ai");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "broccoli_ai");

  await expect(
    transact((tx) =>
      imports.originalFileReads.readOriginalBytes(SETUP_EXTERNAL_AGENT, tx, source.id),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("the agent's people replace the masked records", async ({ orm, seed, transact }) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  await seed.importEmployees(source.id, [{ email: "robin@example.com" }]);
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");

  const result = await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople(PEOPLE),
    ),
  );

  expect(result).toEqual({ status: "mapped", failure: null, people: 1, skipped: 0 });
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });
  expect(records.edges.map(({ node }) => node.email)).toEqual(["avery@example.com"]);
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, originalReadAiSource: "external_agent" },
  ]);
});

test("a second send replaces the first people", async ({ orm, seed, transact }) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");
  await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople(PEOPLE),
    ),
  );

  const result = await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople({ people: [{ firstName: "Robin", email: "robin@example.com" }] }),
    ),
  );

  expect(result).toEqual({ status: "mapped", failure: null, people: 1, skipped: 0 });
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });
  expect(records.edges.map(({ node }) => node.email)).toEqual(["robin@example.com"]);
});

test("an agent answer with nobody left clears records and fails with no people columns", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");

  const result = await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople({ people: [{ jobTitle: "Designer" }] }),
    ),
  );

  expect(result).toEqual({ status: "failed", failure: "no_people_columns", people: 0, skipped: 1 });
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, status: "failed", failure: "no_people_columns" },
  ]);
  expect(
    (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id })).edges,
  ).toEqual([]);
});

test("the agent may send people again after a failed original read", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");
  await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople({ people: [{}] }),
    ),
  );

  const result = await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople(PEOPLE),
    ),
  );

  expect(result).toEqual({ status: "mapped", failure: null, people: 1, skipped: 0 });
});

test("refuses the agent's people without consent", async ({ orm, seed, transact }) => {
  const source = await seed.fileSource({ content: CSV, readBy: "answered_by_external_agent" });
  const imports = importUseCases(orm);

  await expect(
    transact((tx) =>
      imports.originalFileReads.addReadPeople(
        SETUP_EXTERNAL_AGENT,
        tx,
        source.id,
        parseReadPeople(PEOPLE),
      ),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect(
    (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id })).edges,
  ).toEqual([]);
});

test("refuses masked questions for a consented file", async ({ orm, seed, transact }) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");

  await expect(
    transact((tx) =>
      imports.answeredMapping.readMappingQuestions(SETUP_EXTERNAL_AGENT, tx, source.id),
    ),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Read this file in full and send its people.",
  });
});

test("refuses masked answers for a consented file", async ({ orm, seed, transact }) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");

  await expect(
    transact((tx) =>
      imports.answeredMapping.answerMapping(SETUP_EXTERNAL_AGENT, tx, source.id, ANSWERS),
    ),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Read this file in full and send its people.",
  });
});

test("retry leaves a consented file alone without sending another job", async ({ orm, seed }) => {
  await seed.aiSource("external_agent");
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");
  const before = await imports.reads.listSources(SETUP_HOLDER);

  await imports.files.retryFile(SETUP_HOLDER, source.id);

  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toEqual(
    before.map(importSourceValues),
  );
  expect(imports.sentJobs).toEqual([]);
});

test("reset after approval clears consent but keeps records until consent is given again", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.externalAgentSetup();
  const source = await seed.fileSource({ content: CSV, status: "mapped" });
  const imports = importUseCases(orm);
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");
  await transact((tx) =>
    imports.originalFileReads.addReadPeople(
      SETUP_EXTERNAL_AGENT,
      tx,
      source.id,
      parseReadPeople(PEOPLE),
    ),
  );
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id });
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);

  await imports.resetSetup(SETUP_HOLDER);
  await seed.setupStep("import");

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, originalReadAllowedAt: null },
  ]);
  expect(await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: source.id })).toEqual(
    records,
  );
  await expect(
    transact((tx) =>
      imports.originalFileReads.readOriginalBytes(SETUP_EXTERNAL_AGENT, tx, source.id),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, source.id, "external_agent");
  expect(
    await transact((tx) =>
      imports.originalFileReads.readOriginalBytes(SETUP_EXTERNAL_AGENT, tx, source.id),
    ),
  ).toEqual({ content: Buffer.from(CSV), mimeType: "text/csv" });
});
