import {
  finishSelfHostedSetup,
  expect,
  importUseCases,
  OWNER,
  SETUP_HOLDER,
  type TestSeed,
  test,
} from "#test/support";

import { readInstance } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test("keeps review pages and their version tied to the snapshot when another source arrives", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Morgan", lastName: "Reed", email: "morgan@example.com" },
    { firstName: "Riley", lastName: "Brooks", email: "riley@example.com" },
  ]);
  const imports = importUseCases(orm);
  const review = await imports.reads.readReview(SETUP_HOLDER);

  await addFileSource(seed);
  const first = review.listEmployees({ first: 1 });
  const next = review.listEmployees({ first: 1, after: first.pageInfo.endCursor });

  expect(review.employeeCount).toBe(2);
  expect(first.edges).toMatchObject([
    { node: { values: { email: { value: "morgan@example.com" } } } },
  ]);
  expect(next.edges).toMatchObject([
    { node: { values: { email: { value: "riley@example.com" } } } },
  ]);
  expect(first.pageInfo.hasNextPage).toBe(true);
  expect(next.pageInfo.hasNextPage).toBe(false);
  expect((await imports.reads.readReview(SETUP_HOLDER)).version).not.toBe(review.version);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toHaveLength(3);
  await expect(imports.approveImport(SETUP_HOLDER, review.version)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Your people changed while you were reviewing.",
  });
  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toEqual([]);
  expect((await readInstance(orm)).step).toBe("import");
});

test("refuses an old version without creating employees or advancing setup", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const version = (await imports.reads.readReview(SETUP_HOLDER)).version;
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
  expect((await readInstance(orm)).step).toBe("import");
});

test("approves the current version", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  ]);
  const imports = importUseCases(orm);
  const version = (await imports.reads.readReview(SETUP_HOLDER)).version;

  await imports.approveImport(SETUP_HOLDER, version);
  expect((await readInstance(orm)).step).toBe("owner");
  await finishSelfHostedSetup(orm);

  expect((await createEmployeeUseCases({ orm }).listEmployees(OWNER, {})).edges).toMatchObject([
    { node: { firstName: "Avery", lastName: "Stone", email: "avery@example.com" } },
  ]);
  expect((await readInstance(orm)).step).toBe("done");
});

test("changes the version when another source adds a person", async ({ orm, seed }) => {
  const imports = importUseCases(orm);
  const before = (await imports.reads.readReview(SETUP_HOLDER)).version;

  await addFileSource(seed);

  expect((await imports.reads.readReview(SETUP_HOLDER)).version).not.toBe(before);
});

test("changes the version when a ready person's email becomes taken", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const before = await imports.reads.readReview(SETUP_HOLDER);
  expect(before.readyEmployees).toHaveLength(1);

  await seed.employee({ email: "avery@example.com" });

  const after = await imports.reads.readReview(SETUP_HOLDER);
  expect(after.readyEmployees).toEqual([]);
  expect(after.version).not.toBe(before.version);
});

test("refuses an old version after an email becomes taken without adding anyone", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
  ]);
  const imports = importUseCases(orm);
  const review = await imports.reads.readReview(owner);
  expect(review.readyEmployees).toHaveLength(2);
  await seed.employee({ email: "avery@example.com" });
  const employees = createEmployeeUseCases({ orm });
  const before = await employees.listEmployees(owner, {});

  await expect(imports.approveImport(owner, review.version)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await employees.listEmployees(owner, {})).toEqual(before);
  expect((await readInstance(orm)).step).toBe("import");
});

test("changes the version when a review choice changes a value", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const before = (await imports.reads.readReview(SETUP_HOLDER)).version;

  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Designer" },
  });

  expect((await imports.reads.readReview(SETUP_HOLDER)).version).not.toBe(before);
});

test("changes the version when a person is left out", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const before = (await imports.reads.readReview(SETUP_HOLDER)).version;

  await imports.choices.setLeftOut(SETUP_HOLDER, { key: "avery@example.com", leftOut: true });

  expect((await imports.reads.readReview(SETUP_HOLDER)).version).not.toBe(before);
});

test("changes the version when an existing source refreshes its people", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { externalId: "U1", email: "avery@example.com", jobTitle: "Designer" },
  ]);
  const imports = importUseCases(orm);
  const before = (await imports.reads.readReview(SETUP_HOLDER)).version;

  await seed.importEmployees(source.id, [
    { externalId: "U1", email: "avery@example.com", jobTitle: "Engineer" },
  ]);

  expect((await imports.reads.readReview(SETUP_HOLDER)).version).not.toBe(before);
});

test("keeps the version stable while the review is unchanged", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  const version = (await imports.reads.readReview(SETUP_HOLDER)).version;

  expect((await imports.reads.readReview(SETUP_HOLDER)).version).toBe(version);
});

async function addFileSource(seed: TestSeed): Promise<void> {
  const file = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  await seed.importEmployees(file.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  ]);
}
