import { employeeUseCases, expect, OWNER, test } from "#test/support";

test("lists employees in name order across pages", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  const zoe = await seed.employee({ firstName: "Zoe", lastName: "Adams" });
  const samZ = await seed.employee({ firstName: "Sam", lastName: "Zimmer" });
  const ada = await seed.employee({ firstName: "ada", lastName: "Stone" });
  const samA = await seed.employee({ firstName: "sam", lastName: "adams" });
  const ben = await seed.employee({ firstName: "Ben", lastName: "Young" });

  const firstPage = await listEmployees(OWNER, { first: 2 });

  expect(firstPage.edges.map((edge) => edge.node.id)).toEqual([ada.id, ben.id]);
  expect(firstPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.edges.at(-1)?.cursor,
  });

  const secondPage = await listEmployees(OWNER, {
    first: 2,
    after: firstPage.pageInfo.endCursor,
  });

  expect(secondPage.edges.map((edge) => edge.node.id)).toEqual([samA.id, samZ.id]);
  expect(secondPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: secondPage.edges.at(-1)?.cursor,
  });

  const thirdPage = await listEmployees(OWNER, {
    first: 2,
    after: secondPage.pageInfo.endCursor,
  });

  expect(thirdPage.edges.map((edge) => edge.node.id)).toEqual([zoe.id]);
  expect(thirdPage.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: thirdPage.edges.at(-1)?.cursor,
  });
});

test("pages stably through employees with the same name", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  const firstSam = await seed.employee({ firstName: "Sam", lastName: "Lee" });
  const secondSam = await seed.employee({ firstName: "Sam", lastName: "Lee" });
  const [firstId, secondId] = [firstSam.id, secondSam.id].sort();

  const firstPage = await listEmployees(OWNER, { first: 1 });

  expect(firstPage.edges.map((edge) => edge.node.id)).toEqual([firstId]);
  expect(firstPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.edges.at(-1)?.cursor,
  });

  const secondPage = await listEmployees(OWNER, {
    first: 1,
    after: firstPage.pageInfo.endCursor,
  });

  expect(secondPage.edges.map((edge) => edge.node.id)).toEqual([secondId]);
  expect(secondPage.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: secondPage.edges.at(-1)?.cursor,
  });
});

test("sorts by name in descending order", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  const samA = await seed.employee({ firstName: "sam", lastName: "adams" });
  const ada = await seed.employee({ firstName: "Ada" });
  const samZ = await seed.employee({ firstName: "Sam", lastName: "Zimmer" });

  const page = await listEmployees(OWNER, { orderBy: { field: "NAME", direction: "DESC" } });

  expect(page.edges.map((edge) => edge.node.id)).toEqual([samZ.id, samA.id, ada.id]);
});

test("sorts by email", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  const zoe = await seed.employee({ firstName: "Ada", email: "zoe@example.com" });
  const ada = await seed.employee({ firstName: "Zoe", email: "ada@example.com" });
  const ben = await seed.employee({ firstName: "Ben", email: "ben@example.com" });

  const page = await listEmployees(OWNER, { orderBy: { field: "EMAIL", direction: "ASC" } });

  expect(page.edges.map((edge) => edge.node.id)).toEqual([ada.id, ben.id, zoe.id]);
});

test("sorts by start date with employees without one last", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  const undated = await seed.employee({ startDate: null });
  const later = await seed.employee({ startDate: "2026-03-01" });
  const earlier = await seed.employee({ startDate: "2026-02-28" });

  const page = await listEmployees(OWNER, { orderBy: { field: "START_DATE", direction: "ASC" } });

  expect(page.edges.map((edge) => edge.node.id)).toEqual([earlier.id, later.id, undated.id]);
});

test("sorts by start date descending with employees without one still last", async ({
  orm,
  seed,
}) => {
  const { listEmployees } = employeeUseCases(orm);
  const earlier = await seed.employee({ startDate: "2026-02-28" });
  const undated = await seed.employee({ startDate: null });
  const later = await seed.employee({ startDate: "2026-03-01" });

  const page = await listEmployees(OWNER, { orderBy: { field: "START_DATE", direction: "DESC" } });

  expect(page.edges.map((edge) => edge.node.id)).toEqual([later.id, earlier.id, undated.id]);
});

test("pages through a start date order that includes employees without one", async ({
  orm,
  seed,
}) => {
  const { listEmployees } = employeeUseCases(orm);
  const firstUndated = await seed.employee({ startDate: null });
  const later = await seed.employee({ startDate: "2026-03-01" });
  const secondUndated = await seed.employee({ startDate: null });
  const earlier = await seed.employee({ startDate: "2026-02-28" });
  const undatedIds = [firstUndated.id, secondUndated.id].sort();

  const firstPage = await listEmployees(OWNER, {
    first: 2,
    orderBy: { field: "START_DATE", direction: "ASC" },
  });

  expect(firstPage.edges.map((edge) => edge.node.id)).toEqual([earlier.id, later.id]);
  expect(firstPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.edges.at(-1)?.cursor,
  });

  const secondPage = await listEmployees(OWNER, {
    first: 2,
    after: firstPage.pageInfo.endCursor,
    orderBy: { field: "START_DATE", direction: "ASC" },
  });

  expect(secondPage.edges.map((edge) => edge.node.id)).toEqual(undatedIds);
  expect(secondPage.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: secondPage.edges.at(-1)?.cursor,
  });
});

test("finds employees whose first name, last name or email contains the search, ignoring case", async ({
  orm,
  seed,
}) => {
  const { listEmployees } = employeeUseCases(orm);
  const firstNameMatch = await seed.employee({ firstName: "AlphaBeta" });
  const lastNameMatch = await seed.employee({ firstName: "Ben", lastName: "MyALPHAName" });
  const emailMatch = await seed.employee({ firstName: "Cara", email: "team.alpha@example.com" });
  await seed.employee({ firstName: "Dora", lastName: "Stone", email: "dora@example.com" });

  const page = await listEmployees(OWNER, { filter: { search: " aLpHa " } });

  expect(page.edges.map((edge) => edge.node.id)).toEqual([
    firstNameMatch.id,
    lastNameMatch.id,
    emailMatch.id,
  ]);
});

test.for(["Avery Stone", " aVeRy sToNe ", "ery Sto"])(
  "finds employees by full name with search %j",
  async (search, { orm, seed }) => {
    const { listEmployees } = employeeUseCases(orm);
    const match = await seed.employee({ firstName: "Avery", lastName: "Stone" });
    await seed.employee({ firstName: "Avery", lastName: "Reed" });
    await seed.employee({ firstName: "Robin", lastName: "Stone" });

    const page = await listEmployees(OWNER, { filter: { search } });

    expect(page.edges.map((edge) => edge.node.id)).toEqual([match.id]);
  },
);

test("treats percent and underscore in a search literally", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  const percent = await seed.employee({ firstName: "Percent%Name" });
  const underscore = await seed.employee({ firstName: "Underscore_Name" });
  await seed.employee({ firstName: "Ordinary" });

  const percentPage = await listEmployees(OWNER, { filter: { search: "%" } });
  const underscorePage = await listEmployees(OWNER, { filter: { search: "_" } });

  expect(percentPage.edges.map((edge) => edge.node.id)).toEqual([percent.id]);
  expect(underscorePage.edges.map((edge) => edge.node.id)).toEqual([underscore.id]);
});

test("refuses a search longer than 100 characters", async ({ orm }) => {
  const { listEmployees } = employeeUseCases(orm);

  await expect(listEmployees(OWNER, { filter: { search: "a".repeat(101) } })).rejects.toMatchObject(
    {
      code: "INVALID_INPUT",
      message: "The input is invalid.",
      fieldErrors: [{ field: "search", code: "too_long" }],
    },
  );
});

test("refuses a cursor issued under another order", async ({ orm, seed }) => {
  const { listEmployees } = employeeUseCases(orm);
  await seed.employee();
  await seed.employee();
  const firstPage = await listEmployees(OWNER, {
    first: 1,
    orderBy: { field: "NAME", direction: "ASC" },
  });
  const cursor = firstPage.edges[0]!.cursor;

  await expect(
    listEmployees(OWNER, {
      first: 1,
      after: cursor,
      orderBy: { field: "EMAIL", direction: "ASC" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: "The input is invalid.",
    fieldErrors: [{ field: "after", code: "invalid" }],
  });
});
