import { randomUUID } from "node:crypto";

import { expect, importUseCases, OWNER, SYSTEM, test } from "#test/support";

import { DecisionsError } from "../../../../integrations/ai";

test("maps a file in one request when every answer is confident", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content: "Name,Email\nAvery Stone,avery@example.com",
  });
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
  expect(fake.requestCount).toBe(1);
});

test("uses the fallback header and columns when a field answer is unsure", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content: "Staff export\nReference,Name,Email\nIgnored,Avery Stone,avery@example.com",
  });
  fake.answer(
    { headerRow: "1", fullName: "A", jobTitle: { choice: "none", confidence: 0.5 } },
    { headerRow: "2" },
    { fullName: "B", email: "C" },
  );
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
  expect(fake.requestCount).toBe(3);
});

test("maps a semicolon file with a title above the header", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content:
      "Staff export\nFull name;Work email;Role;Start date\nAvery Stone;avery@example.com;Designer;02/03/2026\nRobin Reed;robin@example.com;Engineer;14/01/2026",
  });
  fake.answer({ headerRow: "2", fullName: "A", email: "B", jobTitle: "C", startDate: "D" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapped", failure: null },
  ]);
  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: "Designer",
      startDate: "2026-03-02",
    },
    {
      sourceId: source.id,
      firstName: "Robin",
      lastName: "Reed",
      email: "robin@example.com",
      jobTitle: "Engineer",
      startDate: "2026-01-14",
    },
  ]);
});

test("fails the file when no row is the header", async ({ orm, seed, fakeDecisions: fake }) => {
  const source = await seed.fileSource({ content: "Avery Stone,avery@example.com" });
  fake.answer({ headerRow: "none" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "no_header" },
  ]);
  expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("fails the file when no name or email column is found", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Role\nDesigner" });
  fake.answer({ headerRow: "1", jobTitle: "A" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "no_people_columns" },
  ]);
  expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
});

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

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.listSources(OWNER)).toEqual([source]);
  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toEqual(records);
});

test("a removed source writes nothing and does not throw", async ({ orm, fakeDecisions: fake }) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: randomUUID(), attempt: 0 });

  expect(await imports.listSources(OWNER)).toEqual([]);
  expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("a retryable model failure leaves the source mapping", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.fail(503);
  const imports = importUseCases(orm, { decisions: fake.decisions });

  const result = imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: true });
  expect(await imports.listSources(OWNER)).toEqual([source]);
  expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("an unauthorized model request fails the file as unavailable", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone" });
  fake.fail(401);
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "unavailable" },
  ]);
  expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
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
  const mapping = imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  try {
    await held.received;
    await imports.markFileFailed(SYSTEM, { sourceId: source.id, attempt: 0 });
    await imports.retryFile(OWNER, source.id);
    const restarted = await imports.listSources(OWNER);
    expect(restarted).toMatchObject([{ id: source.id, status: "mapping", failure: null }]);
    expect(imports.sentJobs).toEqual([
      { name: "imports.mapFile", payload: { sourceId: source.id, attempt: 1 } },
    ]);

    held.release();
    await mapping;

    expect(await imports.listSources(OWNER)).toEqual(restarted);
    expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
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
  const mapping = imports.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  try {
    await held.received;
    await imports.removeFile(OWNER, source.id);
    held.release();
    await mapping;

    expect(await imports.listSources(OWNER)).toEqual([]);
    expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
  } finally {
    held.release();
    await mapping;
  }
});
