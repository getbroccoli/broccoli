import { expect, importUseCases, OWNER, test } from "#test/support";

test("counts a source's employees and returns zero for an absent source", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ firstName: "Avery" }, { firstName: "Robin" }]);
  const absentId = "00000000-0000-4000-8000-000000000001";
  const imports = importUseCases(orm);

  const counts = await imports.reads.countEmployees(OWNER, [source.id, absentId]);

  expect(counts).toEqual(
    new Map([
      [source.id, 2],
      [absentId, 0],
    ]),
  );
});
