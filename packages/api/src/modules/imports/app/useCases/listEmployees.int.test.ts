import { expect, importUseCases, OWNER, test } from "#test/support";

import { parseCalendarDate } from "../../../../utils";

test("groups a Slack member and a file row with one email into one import employee", async ({
  orm,
  seed,
}) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const members = await seed.importEmployees(slack.id, [{ email: "avery@example.com" }]);
  const rows = await seed.importEmployees(file.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);

  const page = (await imports.reads.readReview(OWNER)).listEmployees({});

  expect(page.edges.map(({ node }) => node)).toMatchObject([
    { key: "avery@example.com", records: [...rows, ...members] },
  ]);
});

test("lists only the requested source’s records in their input order", async ({ orm, seed }) => {
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const slack = await seed.importSource();
  const rows = await seed.importEmployees(file.id, [{ firstName: "Zoe" }, { firstName: "Avery" }]);
  await seed.importEmployees(slack.id, [{}]);
  const imports = importUseCases(orm);

  const page = await imports.reads.listEmployeeRecords(OWNER, { sourceId: file.id });

  expect(page.edges.map(({ node }) => node)).toEqual(rows);
});

test("finds part of a shown first name, last name or email, ignoring case", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Original", email: "avery@example.com" },
    { firstName: "Ben", lastName: "MyALPHAName" },
    { firstName: "Cara", email: "team.alpha@example.com" },
    { firstName: "Dora", lastName: "Stone" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "firstName",
    choice: { value: "AlphaBeta" },
  });

  const review = await imports.reads.readReview(OWNER);
  const page = review.listEmployees({ filter: { search: " aLpHa " } });
  const original = review.listEmployees({ filter: { search: "Original" } });

  expect(page.edges.map(({ node }) => node.values.firstName.value)).toEqual([
    "AlphaBeta",
    "Ben",
    "Cara",
  ]);
  expect(original.edges).toEqual([]);
});

test("treats percent and underscore in a search literally", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Percent%Name" },
    { firstName: "Underscore_Name" },
    { firstName: "Ordinary" },
  ]);
  const imports = importUseCases(orm);

  const review = await imports.reads.readReview(OWNER);
  const percent = review.listEmployees({ filter: { search: "%" } });
  const underscore = review.listEmployees({ filter: { search: "_" } });

  expect(percent.edges.map(({ node }) => node.values.firstName.value)).toEqual(["Percent%Name"]);
  expect(underscore.edges.map(({ node }) => node.values.firstName.value)).toEqual([
    "Underscore_Name",
  ]);
});

test("refuses a search longer than 100 characters", async ({ orm }) => {
  const imports = importUseCases(orm);
  const review = await imports.reads.readReview(OWNER);

  expect(() => review.listEmployees({ filter: { search: "a".repeat(101) } })).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "search", code: "too_long" }],
    }),
  );
});

test.for([
  { field: "NAME", direction: "ASC", names: ["ada", "Sam", "sam", "Zoe"] },
  { field: "NAME", direction: "DESC", names: ["Zoe", "sam", "Sam", "ada"] },
  { field: "EMAIL", direction: "ASC", names: ["Zoe", "Sam", "sam", "ada"] },
  { field: "EMAIL", direction: "DESC", names: ["sam", "Sam", "Zoe", "ada"] },
  { field: "START_DATE", direction: "ASC", names: ["sam", "Sam", "Zoe", "ada"] },
  { field: "START_DATE", direction: "DESC", names: ["Sam", "sam", "ada", "Zoe"] },
] as const)(
  "pages every import employee once by $field $direction with nulls last",
  async ({ field, direction, names }, { orm, seed }) => {
    const source = await seed.importSource();
    await seed.importEmployees(source.id, [
      { firstName: "Zoe", email: "a@example.com" },
      {
        firstName: "Sam",
        lastName: "Adams",
        email: "b@example.com",
        startDate: parseCalendarDate("2026-03-01")!,
      },
      {
        firstName: "sam",
        lastName: "Adams",
        email: "c@example.com",
        startDate: parseCalendarDate("2026-02-28")!,
      },
      { firstName: "ada", email: null },
    ]);
    const file = await seed.fileSource({ content: "x", status: "mapped" });
    await seed.importEmployees(file.id, [
      {
        firstName: "Sam",
        lastName: "Adams",
        email: "b@example.com",
        startDate: parseCalendarDate("2026-03-01")!,
      },
    ]);
    const imports = importUseCases(orm);
    const orderBy = { field, direction };
    const review = await imports.reads.readReview(OWNER);
    const first = review.listEmployees({ first: 2, orderBy });

    const second = review.listEmployees({
      first: 2,
      after: first.pageInfo.endCursor,
      orderBy,
    });

    const employees = [...first.edges, ...second.edges].map(({ node }) => node);
    expect(employees.map(({ values }) => values.firstName.value)).toEqual(names);
    expect(new Set(employees.map(({ key }) => key)).size).toBe(4);
    expect(first.pageInfo).toEqual({ hasNextPage: true, endCursor: first.edges.at(-1)!.cursor });
    expect(second.pageInfo).toEqual({ hasNextPage: false, endCursor: second.edges.at(-1)!.cursor });
  },
);

test("refuses a cursor from another order", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{}, {}]);
  const imports = importUseCases(orm);
  const review = await imports.reads.readReview(OWNER);
  const first = review.listEmployees({
    first: 1,
    orderBy: { field: "NAME", direction: "ASC" },
  });

  expect(() =>
    review.listEmployees({
      first: 1,
      after: first.edges[0]!.cursor,
      orderBy: { field: "EMAIL", direction: "ASC" },
    }),
  ).toThrowError(
    expect.objectContaining({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "after", code: "invalid" }],
    }),
  );
});

test.for([
  { check: "conflict:jobTitle", email: "avery@example.com" },
  { check: "incomplete:lastName", email: "robin@example.com" },
])("filters import employees by $check", async ({ check, email }, { orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [
    { email: "avery@example.com", jobTitle: "Engineer" },
    { email: "robin@example.com", lastName: null },
    {},
  ]);
  await seed.importEmployees(file.id, [{ email: "avery@example.com", jobTitle: "Designer" }]);
  const imports = importUseCases(orm);

  const page = (await imports.reads.readReview(OWNER)).listEmployees({ filter: { check } });

  expect(page.edges.map(({ node }) => node.key)).toEqual([email]);
});
