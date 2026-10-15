import { expect, importUseCases, OWNER, test } from "#test/support";

import { parseCalendarDate } from "../../../../utils";

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

test("finds part of a first name, last name or email, ignoring case", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "AlphaBeta" },
    { firstName: "Ben", lastName: "MyALPHAName" },
    { firstName: "Cara", email: "team.alpha@example.com" },
    { firstName: "Dora", lastName: "Stone", email: "dora@example.com" },
  ]);
  const imports = importUseCases(orm);

  const page = await imports.reads.listEmployees(OWNER, { filter: { search: " aLpHa " } });

  expect(page.edges.map(({ node }) => node.firstName)).toEqual(["AlphaBeta", "Ben", "Cara"]);
});

test("treats percent and underscore in a search literally", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Percent%Name" },
    { firstName: "Underscore_Name" },
    { firstName: "Ordinary" },
  ]);
  const imports = importUseCases(orm);

  const percent = await imports.reads.listEmployees(OWNER, { filter: { search: "%" } });
  const underscore = await imports.reads.listEmployees(OWNER, { filter: { search: "_" } });

  expect(percent.edges.map(({ node }) => node.firstName)).toEqual(["Percent%Name"]);
  expect(underscore.edges.map(({ node }) => node.firstName)).toEqual(["Underscore_Name"]);
});

test("refuses a search longer than 100 characters", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(
    imports.reads.listEmployees(OWNER, { filter: { search: "a".repeat(101) } }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "search", code: "too_long" }],
  });
});

test("orders by email descending", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Ada", email: "ada@example.com" },
    { firstName: "Ben", email: "zoe@example.com" },
    { firstName: "Zoe", email: "ben@example.com" },
  ]);
  const imports = importUseCases(orm);

  const page = await imports.reads.listEmployees(OWNER, {
    orderBy: { field: "EMAIL", direction: "DESC" },
  });

  expect(page.edges.map(({ node }) => node.email)).toEqual([
    "zoe@example.com",
    "ben@example.com",
    "ada@example.com",
  ]);
});

test.for(["ASC", "DESC"] as const)(
  "pages by start date %s with records without one last",
  async (direction, { orm, seed }) => {
    const source = await seed.importSource();
    const employees = await seed.importEmployees(source.id, [
      { firstName: "Ada", startDate: null },
      { firstName: "Ben", startDate: parseCalendarDate("2026-03-01")! },
      { firstName: "Cara", startDate: parseCalendarDate("2026-02-28")! },
      { firstName: "Dora", startDate: null },
    ]);
    const undatedIds = employees
      .filter(({ startDate }) => startDate === null)
      .map(({ id }) => id)
      .sort();
    const imports = importUseCases(orm);
    const orderBy = { field: "START_DATE", direction } as const;

    const first = await imports.reads.listEmployees(OWNER, { first: 2, orderBy });
    const second = await imports.reads.listEmployees(OWNER, {
      first: 2,
      after: first.pageInfo.endCursor,
      orderBy,
    });

    expect(first.edges.map(({ node }) => node.firstName)).toEqual(
      direction === "ASC" ? ["Cara", "Ben"] : ["Ben", "Cara"],
    );
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(second.edges.map(({ node }) => node.id)).toEqual(
      direction === "ASC" ? undatedIds : undatedIds.toReversed(),
    );
    expect(second.pageInfo.hasNextPage).toBe(false);
  },
);

test("refuses a cursor from another order", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}, {}]);
  const imports = importUseCases(orm);
  const first = await imports.reads.listEmployees(OWNER, {
    first: 1,
    orderBy: { field: "NAME", direction: "ASC" },
  });

  await expect(
    imports.reads.listEmployees(OWNER, {
      first: 1,
      after: first.edges[0]!.cursor,
      orderBy: { field: "EMAIL", direction: "ASC" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "after", code: "invalid" }],
  });
});
