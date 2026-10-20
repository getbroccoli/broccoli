import { randomUUID } from "node:crypto";

import { expect, importUseCases, OWNER, SYSTEM, test } from "#test/support";

import { DecisionsError } from "../../../../integrations/ai";

test("a stale attempt leaves the source and its records unchanged", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nRobin Reed", attempt: 1 });
  const records = await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone" },
  ]);
  fake.answer({ headerRow: "1", fullName: "A" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual(records);
});

test("a removed source writes nothing and does not throw", async ({ orm, fakeDecisions: fake }) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: randomUUID(), attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("a retryable model failure leaves the source mapping", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.fail(503);
  const imports = importUseCases(orm, { decisions: fake.decisions });

  const result = imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: true });
  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("an unauthorized model request fails the file as unavailable", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.fail(401);
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "unavailable", failureMessage: null },
  ]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("a provider refusal fails the file with the provider's message", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.fail(403, "The free period of Broccoli AI is over.");
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    {
      id: source.id,
      status: "failed",
      failure: "unavailable",
      failureMessage: "The free period of Broccoli AI is over.",
    },
  ]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("retrying a failed file clears its failure message", async ({ orm, seed }) => {
  const source = await seed.fileSource({
    content: "Name\nAvery Stone",
    status: "failed",
    failure: "unavailable",
    failureMessage: "The free period of Broccoli AI is over.",
  });
  const imports = importUseCases(orm);
  expect(source).toMatchObject({ failureMessage: "The free period of Broccoli AI is over." });

  await imports.files.retryFile(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapping", failure: null, failureMessage: null },
  ]);
});

test("an expired Broccoli AI free period fails the file without the provider's message", async ({
  orm,
  seed,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  const imports = importUseCases(orm, {
    decisions: {
      decide: () =>
        Promise.reject(
          new DecisionsError("Forbidden", false, "The free period is over.", "free_period_over"),
        ),
    },
  });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "ai_free_period_over", failureMessage: null },
  ]);
});

test("an in-flight answer leaves a retried source mapping without records", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.answer({ headerRow: "1", fullName: "A" });
  const held = fake.holdNextAnswer();
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const mapping = imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  try {
    await held.received;
    await imports.files.markFileFailed(SYSTEM, { sourceId: source.id, attempt: 0 });
    await imports.files.retryFile(OWNER, source.id);
    const restarted = await imports.reads.listSources(OWNER);
    expect(restarted).toMatchObject([{ id: source.id, status: "mapping", failure: null }]);
    expect(imports.sentJobs).toEqual([
      { name: "imports.mapFile", payload: { sourceId: source.id, attempt: 1 } },
    ]);

    held.release();
    await mapping;

    expect(await imports.reads.listSources(OWNER)).toEqual(restarted);
    expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
  } finally {
    held.release();
    await mapping;
  }
});

test("an in-flight answer does not restore a removed source or its records", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.answer({ headerRow: "1", fullName: "A" });
  const held = fake.holdNextAnswer();
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const mapping = imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  try {
    await held.received;
    await imports.files.removeFile(OWNER, source.id);
    held.release();
    await mapping;

    expect(await imports.reads.listSources(OWNER)).toEqual([]);
    expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
  } finally {
    held.release();
    await mapping;
  }
});
