import { expect, importUseCases, OWNER, SYSTEM, test } from "#test/support";

test("fails the file when its current attempt is exhausted", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", attempt: 2 });
  const imports = importUseCases(orm);

  await imports.markFileFailed(SYSTEM, { sourceId: source.id, attempt: 2 });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "unavailable" },
  ]);
});

test("a stale failure leaves the source unchanged", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", attempt: 2 });
  const imports = importUseCases(orm);

  await imports.markFileFailed(SYSTEM, { sourceId: source.id, attempt: 1 });

  expect(await imports.listSources(OWNER)).toEqual([source]);
});
