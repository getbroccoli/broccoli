import { expect, importUseCases, OWNER, test } from "#test/support";

test("lists the import's employees without a source filter", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ firstName: "Avery" }, { firstName: "Robin" }]);
  const imports = importUseCases(orm);

  const page = await imports.reads.listEmployees(OWNER, {});

  expect(page.edges.map(({ node }) => node)).toMatchObject([
    { sourceId: source.id, firstName: "Avery" },
    { sourceId: source.id, firstName: "Robin" },
  ]);
});

test("lists only employees belonging to the requested source", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const employees = await seed.importEmployees(source.id, [{ firstName: "Avery" }]);
  const imports = importUseCases(orm);

  const matching = await imports.reads.listEmployees(OWNER, { sourceId: source.id });
  const missing = await imports.reads.listEmployees(OWNER, {
    sourceId: "00000000-0000-4000-8000-000000000001",
  });

  expect(matching.edges.map(({ node }) => node)).toEqual(employees);
  expect(missing.edges).toEqual([]);
});

test("pages employees by first name, last name and id, ignoring name case", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  const employees = await seed.importEmployees(source.id, [
    { firstName: "Zoe", lastName: "Adams" },
    { firstName: "Sam", lastName: "Zimmer" },
    { firstName: "ada", lastName: "Stone" },
    { firstName: "sam", lastName: "adams" },
    { firstName: "Sam", lastName: "Adams" },
  ]);
  const ada = employees.find(({ firstName }) => firstName === "ada")!;
  const tiedIds = employees
    .filter(
      ({ firstName, lastName }) =>
        firstName?.toLowerCase() === "sam" && lastName?.toLowerCase() === "adams",
    )
    .map(({ id }) => id)
    .sort();
  const samZ = employees.find(({ lastName }) => lastName === "Zimmer")!;
  const zoe = employees.find(({ firstName }) => firstName === "Zoe")!;
  const imports = importUseCases(orm);

  const first = await imports.reads.listEmployees(OWNER, { first: 2 });
  const second = await imports.reads.listEmployees(OWNER, {
    first: 2,
    after: first.pageInfo.endCursor,
  });
  const third = await imports.reads.listEmployees(OWNER, {
    first: 2,
    after: second.pageInfo.endCursor,
  });

  expect(first.edges.map(({ node }) => node.id)).toEqual([ada.id, tiedIds[0]]);
  expect(first.pageInfo).toEqual({ hasNextPage: true, endCursor: first.edges.at(-1)?.cursor });
  expect(second.edges.map(({ node }) => node.id)).toEqual([tiedIds[1], samZ.id]);
  expect(second.pageInfo).toEqual({ hasNextPage: true, endCursor: second.edges.at(-1)?.cursor });
  expect(third.edges.map(({ node }) => node.id)).toEqual([zoe.id]);
  expect(third.pageInfo).toEqual({ hasNextPage: false, endCursor: third.edges.at(-1)?.cursor });
});
