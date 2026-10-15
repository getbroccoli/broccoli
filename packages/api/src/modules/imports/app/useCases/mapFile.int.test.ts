import { sql } from "drizzle-orm";

import { expect, importUseCases, OWNER, SYSTEM, test, xlsxFile } from "#test/support";

test("maps a file in one request when every answer is confident", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content: "Name,Email\nAvery Stone,avery@example.com",
  });
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
  expect(fake.requestCount).toBe(1);
});

test("uses the fallback header and columns when a field answer is unsure", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content: "Staff export\nReference,Name,Email\nIgnored,Avery Stone,avery@example.com",
  });
  fake.answer(
    { headerRow: "1", fullName: "A", jobTitle: { choice: "none", confidence: 0.5 } },
    { headerRow: "2" },
    { fullName: "B", email: "C" },
  );
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
  expect(fake.requestCount).toBe(3);
});

test("maps a semicolon file with a title above the header", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content:
      "Staff export\nFull name;Work email;Role;Start date\nAvery Stone;avery@example.com;Designer;02/03/2026\nRobin Reed;robin@example.com;Engineer;14/01/2026",
  });
  fake.answer({ headerRow: "2", fullName: "A", email: "B", jobTitle: "C", startDate: "D" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapped", failure: null },
  ]);
  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: "Designer",
      startDate: "2026-03-02",
    },
    {
      sourceId: source.id,
      firstName: "Robin",
      lastName: "Reed",
      email: "robin@example.com",
      jobTitle: "Engineer",
      startDate: "2026-01-14",
    },
  ]);
});

test("maps a file without a header from its cells", async ({ orm, seed, fakeDecisions: fake }) => {
  const source = await seed.fileSource({
    content: "Avery Stone,avery@example.com\nRobin Reed,robin@example.com",
  });
  fake.answer({ headerRow: "none", fullName: "A", email: "B" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapped", failure: null },
  ]);
  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
    {
      sourceId: source.id,
      firstName: "Robin",
      lastName: "Reed",
      email: "robin@example.com",
      jobTitle: null,
      startDate: null,
    },
  ]);
});

test("fails the file when no name or email column is found", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({ content: "Role\nDesigner" });
  fake.answer({ headerRow: "1", jobTitle: "A" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "no_people_columns" },
  ]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
});

test("maps each sheet's own columns and keeps both records under sheet-qualified ids", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    name: "staff.xlsx",
    content: xlsxFile({
      sheets: [
        {
          name: "Staff",
          rows: [
            ["Name", "Email"],
            ["Avery Stone", "avery@example.com"],
          ],
        },
        {
          name: "Contractors",
          rows: [
            ["Email", "Full name", "Role"],
            ["robin@example.com", "Robin Reed", "Designer"],
          ],
        },
      ],
    }),
  });
  fake.answer(
    { headerRow: "1", fullName: "A", email: "B" },
    { headerRow: "1", fullName: "B", email: "A", jobTitle: "C" },
  );
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapped", failure: null },
  ]);
  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([
    {
      sourceId: source.id,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      jobTitle: null,
      startDate: null,
    },
    {
      sourceId: source.id,
      firstName: "Robin",
      lastName: "Reed",
      email: "robin@example.com",
      jobTitle: "Designer",
      startDate: null,
    },
  ]);
  const { rows } = await orm.execute<{ externalId: string; email: string }>(sql`
    select external_id as "externalId", "values"->>'email' as email
    from import_records where source_id = ${source.id} order by external_id
  `);
  expect(rows).toEqual([
    { externalId: "Contractors!row:2", email: "robin@example.com" },
    { externalId: "Staff!row:2", email: "avery@example.com" },
  ]);
});

test("uses fallback answers for an unsure sheet before mapping the next sheet", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    name: "staff.xlsx",
    content: xlsxFile({
      sheets: [
        {
          name: "Staff",
          rows: [["Staff export"], ["Reference", "Name"], ["Ignored", "Avery Stone"]],
        },
        {
          name: "Contractors",
          rows: [
            ["Email", "Name"],
            ["robin@example.com", "Robin Reed"],
          ],
        },
      ],
    }),
  });
  fake.answer(
    { headerRow: "1", fullName: { choice: "A", confidence: 0.5 } },
    { headerRow: "2" },
    { fullName: "B" },
    { headerRow: "1", email: "A", fullName: "B" },
  );
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([
    { firstName: "Avery", lastName: "Stone", email: null },
    { firstName: "Robin", lastName: "Reed", email: "robin@example.com" },
  ]);
});

test("skips sheets without people and maps the remaining sheet", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    name: "staff.xlsx",
    content: xlsxFile({
      sheets: [
        { name: "Departments", rows: [["Department"], ["Engineering"]] },
        { name: "Staff", rows: [["Name"], ["Avery Stone"]] },
        { name: "Lists", rows: [["Office"], ["London"]] },
      ],
    }),
  });
  fake.answer({ headerRow: "1" }, { headerRow: "1", fullName: "A" }, { headerRow: "1" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapped", failure: null },
  ]);
  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node),
  ).toMatchObject([{ sourceId: source.id, firstName: "Avery", lastName: "Stone" }]);
});

test("fails a workbook with no people columns on any sheet", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    name: "staff.xlsx",
    content: xlsxFile({
      sheets: [
        { name: "Departments", rows: [["Department"], ["Engineering"]] },
        { name: "Lists", rows: [["Role"], ["Designer"]] },
      ],
    }),
  });
  fake.answer({ headerRow: "1" }, { headerRow: "1", jobTitle: "A" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "no_people_columns" },
  ]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
});
