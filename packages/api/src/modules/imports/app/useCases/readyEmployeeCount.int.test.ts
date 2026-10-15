import { expect, importUseCases, OWNER, test } from "#test/support";

test("counts ready records across Slack and file sources, leaving incomplete records out", async ({
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

test("counts zero ready records without records", async ({ orm }) => {
  const imports = importUseCases(orm);

  expect(await imports.reads.readyEmployeeCount(OWNER)).toBe(0);
});
