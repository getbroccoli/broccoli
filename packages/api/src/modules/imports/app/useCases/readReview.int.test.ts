import {
  employeeUseCases,
  importSourceValues,
  expect,
  importUseCases,
  OWNER,
  test,
} from "#test/support";

test("counts ready import employees across Slack and file sources, leaving incomplete records out", async ({
  orm,
  seed,
}) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{}, { lastName: null }]);
  await seed.importEmployees(file.id, [{}]);
  const imports = importUseCases(orm);

  const count = (await imports.reads.readReview(OWNER)).readyEmployees.length;

  expect(count).toBe(2);
});

test("counts zero ready import employees without records", async ({ orm }) => {
  const imports = importUseCases(orm);

  expect((await imports.reads.readReview(OWNER)).readyEmployees.length).toBe(0);
});

test("counts a Slack member and a file row with one email once", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ email: "avery@example.com" }]);
  await seed.importEmployees(file.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);

  expect((await imports.reads.readReview(OWNER)).readyEmployees.length).toBe(1);
});

test("does not count a left-out import employee as ready", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }, {}]);
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: true });

  expect((await imports.reads.readReview(OWNER)).readyEmployees.length).toBe(1);
});

test("does not count an import employee whose email an employee already has as ready", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  const avery = { firstName: "Avery", lastName: "Stone", email: "avery@example.com" };
  const robin = { firstName: "Robin", lastName: "Reed", email: "robin@example.com" };
  await seed.importEmployees(source.id, [avery, robin]);
  await employeeUseCases(orm).createEmployee(owner, avery);
  const imports = importUseCases(orm);

  const review = await imports.reads.readReview(owner);

  expect(review.readyEmployees.map(({ values }) => values.email.value)).toEqual([robin.email]);
});

test("leaves out a source whose only person is left out", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ email: "avery@example.com" }]);
  await seed.importEmployees(file.id, [{}]);
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: true });

  const sources = (await imports.reads.readReview(OWNER)).readyEmployeeSources;

  expect(sources.map(importSourceValues)).toEqual([importSourceValues(file)]);
});

test("leaves out a source whose only person is incomplete", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ lastName: null }]);
  await seed.importEmployees(file.id, [{}]);
  const imports = importUseCases(orm);

  const sources = (await imports.reads.readReview(OWNER)).readyEmployeeSources;

  expect(sources.map(importSourceValues)).toEqual([importSourceValues(file)]);
});

test("lists a source once when it holds several added people", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}, {}]);
  const imports = importUseCases(orm);

  const sources = (await imports.reads.readReview(OWNER)).readyEmployeeSources;

  expect(sources.map(importSourceValues)).toEqual([importSourceValues(source)]);
});

test("the review keeps the approved employees ready and their sources after approval", async ({
  orm,
  seed,
}) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  ]);
  const imports = importUseCases(orm);
  const before = await imports.reads.readReview(owner);

  await imports.approveImport(owner, before.version);

  const after = await imports.reads.readReview(owner);
  expect(after.readyEmployees).toEqual(before.readyEmployees);
  expect(after.readyEmployeeSources.map(importSourceValues)).toEqual([importSourceValues(source)]);
});

test("lists manager checks and filters the review by one of them", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com", manager: "Missing Person" },
    { email: "robin@example.com" },
  ]);

  const review = await importUseCases(orm).reads.readReview(OWNER);

  expect(review.checks).toEqual([
    { id: "manager:noPersonMatches", kind: "manager", problem: "noPersonMatches", count: 1 },
  ]);
  expect(review.managers.get("avery@example.com")).toEqual({
    manager: null,
    problem: "noPersonMatches",
  });
  expect(
    review
      .listEmployees({ filter: { check: "manager:noPersonMatches" } })
      .edges.map(({ node }) => node.key),
  ).toEqual(["avery@example.com"]);
});

test("changes the review version when a manager is chosen", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
  ]);
  const imports = importUseCases(orm);
  const before = await imports.reads.readReview(OWNER);

  await imports.choices.chooseManager(OWNER, {
    keys: ["avery@example.com"],
    managerKey: "robin@example.com",
  });

  expect((await imports.reads.readReview(OWNER)).version).not.toBe(before.version);
});
