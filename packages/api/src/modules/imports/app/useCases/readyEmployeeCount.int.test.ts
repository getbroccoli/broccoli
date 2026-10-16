import { expect, importUseCases, OWNER, test } from "#test/support";

test("counts ready import employees across Slack and file sources, leaving incomplete records out", async ({
  orm,
  seed,
}) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{}, { lastName: null }]);
  await seed.importEmployees(file.id, [{}]);
  const imports = importUseCases(orm);

  const count = await imports.reads.readyEmployeeCount(OWNER);

  expect(count).toBe(2);
});

test("counts zero ready import employees without records", async ({ orm }) => {
  const imports = importUseCases(orm);

  expect(await imports.reads.readyEmployeeCount(OWNER)).toBe(0);
});

test("counts a Slack member and a file row with one email once", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ email: "avery@example.com" }]);
  await seed.importEmployees(file.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);

  expect(await imports.reads.readyEmployeeCount(OWNER)).toBe(1);
});

test("does not count a left-out import employee as ready", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }, {}]);
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: true });

  expect(await imports.reads.readyEmployeeCount(OWNER)).toBe(1);
});
