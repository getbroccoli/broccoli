import { expect, importUseCases, OWNER, test } from "#test/support";

test("restarts a failed file with the next attempt", async ({ orm, seed }) => {
  const source = await seed.fileSource({
    content: "Name\nAvery Stone",
    status: "failed",
    failure: "unavailable",
  });
  const imports = importUseCases(orm);

  await imports.retryFile(OWNER, source.id);

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapping", failure: null },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId: source.id, attempt: 1 } },
  ]);
});

test("leaves a mapped file unchanged without sending a job", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);

  await imports.retryFile(OWNER, source.id);

  expect(await imports.listSources(OWNER)).toEqual([source]);
  expect(imports.sentJobs).toEqual([]);
});
