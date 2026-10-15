import { expect, importUseCases, OWNER, storedFileIds, test } from "#test/support";

test("removes the source, its records and its stored file", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  await seed.importEmployees(source.id, [{ firstName: "Avery", lastName: "Stone" }]);
  const otherFile = await seed.file({ content: Buffer.from("keep"), mimeType: "text/plain" });
  const imports = importUseCases(orm);

  await imports.removeFile(OWNER, source.id);

  expect(await imports.listSources(OWNER)).toEqual([]);
  expect((await imports.listEmployees(OWNER, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([otherFile]);
});

test("leaves the Slack source and its records unchanged", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [{ firstName: "Avery" }]);
  const imports = importUseCases(orm);

  await imports.removeFile(OWNER, source.id);

  expect(await imports.listSources(OWNER)).toEqual([source]);
  expect((await imports.listEmployees(OWNER, {})).edges.map(({ node }) => node)).toEqual(records);
});
