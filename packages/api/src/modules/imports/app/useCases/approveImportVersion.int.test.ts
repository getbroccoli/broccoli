import { expect, importUseCases, OWNER, SETUP_AGENT, SETUP_HOLDER, test } from "#test/support";

import { instanceRepository, readSetupStep } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";
import { importVersion } from "../../domain";

test("keeps review pages and their version tied to the snapshot when another source arrives", async ({
  orm,
  seed,
  transact,
}) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Morgan", lastName: "Reed", email: "morgan@example.com" },
    { firstName: "Riley", lastName: "Brooks", email: "riley@example.com" },
  ]);
  const imports = importUseCases(orm);
  const snapshot = await imports.reads.readSnapshot(SETUP_HOLDER);

  await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "more-staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com" }],
    }),
  );
  const first = await imports.reads.listEmployees(SETUP_HOLDER, { first: 1 }, snapshot);
  const next = await imports.reads.listEmployees(
    SETUP_HOLDER,
    { first: 1, after: first.pageInfo.endCursor },
    snapshot,
  );

  expect(snapshot.employees).toHaveLength(2);
  expect(snapshot.version).toBe(importVersion(snapshot.employees));
  expect(first.edges).toMatchObject([
    { node: { values: { email: { value: "morgan@example.com" } } } },
  ]);
  expect(next.edges).toMatchObject([
    { node: { values: { email: { value: "riley@example.com" } } } },
  ]);
  expect(first.pageInfo.hasNextPage).toBe(true);
  expect(next.pageInfo.hasNextPage).toBe(false);
  expect(await imports.reads.readVersion(SETUP_HOLDER)).not.toBe(snapshot.version);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toHaveLength(3);
  await expect(imports.approveImport(SETUP_HOLDER, snapshot.version)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Your people changed while you were reviewing.",
  });
  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toEqual([]);
  expect(await readSetupStep(orm)).toBe("import");
});

test("refuses an old version without creating employees or advancing setup", async ({
  orm,
  seed,
}) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const version = await imports.reads.readVersion(SETUP_HOLDER);
  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });

  await expect(imports.approveImport(SETUP_HOLDER, version)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Your people changed while you were reviewing.",
  });

  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toEqual([]);
  expect(await readSetupStep(orm)).toBe("import");
});

test("approves the current version", async ({ orm, seed }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  ]);
  const imports = importUseCases(orm);
  const version = await imports.reads.readVersion(SETUP_HOLDER);

  await imports.approveImport(SETUP_HOLDER, version);

  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toMatchObject([
    { node: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" } },
  ]);
  expect(await readSetupStep(orm)).toBe("owner");
});

test("changes the version when another source adds a person", async ({ orm, transact }) => {
  const imports = importUseCases(orm);
  const before = await imports.reads.readVersion(SETUP_HOLDER);

  await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com" }],
    }),
  );

  expect(await imports.reads.readVersion(SETUP_HOLDER)).not.toBe(before);
});

test("changes the version when a review choice changes a value", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const before = await imports.reads.readVersion(SETUP_HOLDER);

  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });

  expect(await imports.reads.readVersion(SETUP_HOLDER)).not.toBe(before);
});

test("changes the version when a person is left out", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const before = await imports.reads.readVersion(SETUP_HOLDER);

  await imports.choices.setLeftOut(SETUP_HOLDER, { key: "avery@example.com", leftOut: true });

  expect(await imports.reads.readVersion(SETUP_HOLDER)).not.toBe(before);
});

test("changes the version when an existing source refreshes its people", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { externalId: "U1", email: "avery@example.com", jobTitle: "Designer" },
  ]);
  const imports = importUseCases(orm);
  const before = await imports.reads.readVersion(SETUP_HOLDER);

  await seed.importEmployees(source.id, [
    { externalId: "U1", email: "avery@example.com", jobTitle: "Engineer" },
  ]);

  expect(await imports.reads.readVersion(SETUP_HOLDER)).not.toBe(before);
});

test("keeps the version stable while the review is unchanged", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const version = await imports.reads.readVersion(SETUP_HOLDER);

  expect(await imports.reads.readVersion(SETUP_HOLDER)).toBe(version);
});
