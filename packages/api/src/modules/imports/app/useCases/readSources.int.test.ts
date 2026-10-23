import { importSourceValues, expect, importUseCases, OWNER, test } from "#test/support";

test("reads requested sources and omits missing sources", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const absentId = "00000000-0000-4000-8000-000000000001";
  const imports = importUseCases(orm);

  expect(
    (await imports.reads.readSources(OWNER, [source.id, absentId])).map(importSourceValues),
  ).toEqual([importSourceValues(source)]);
  expect(await imports.reads.readSources(OWNER, [absentId])).toEqual([]);
});
