import { expect, importUseCases, OWNER, test } from "#test/support";

test("leaves out a source whose only person is left out", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ email: "avery@example.com" }]);
  await seed.importEmployees(file.id, [{}]);
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: true });

  const sources = await imports.reads.listReadyEmployeeSources(OWNER);

  expect(sources).toEqual([file]);
});

test("leaves out a source whose only person is incomplete", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ lastName: null }]);
  await seed.importEmployees(file.id, [{}]);
  const imports = importUseCases(orm);

  const sources = await imports.reads.listReadyEmployeeSources(OWNER);

  expect(sources).toEqual([file]);
});

test("lists a source once when it holds several added people", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}, {}]);
  const imports = importUseCases(orm);

  const sources = await imports.reads.listReadyEmployeeSources(OWNER);

  expect(sources).toEqual([source]);
});
