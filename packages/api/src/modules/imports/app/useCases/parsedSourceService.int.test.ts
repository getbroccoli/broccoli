import {
  expect,
  importUseCases,
  SETUP_AGENT,
  SETUP_HOLDER,
  storedFileIds,
  test,
} from "#test/support";

test("stores parsed people as a mapped source without a file or model job", async ({
  orm,
  transact,
}) => {
  const imports = importUseCases(orm);

  const result = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", email: "AVERY@example.com" }],
    }),
  );

  expect(result.id).toBeTypeOf("string");
  expect(result).toMatchObject({ people: 1, skipped: 0 });
  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    {
      id: result.id,
      name: "staff.pdf",
      status: "mapped",
      readBy: "parsed_by_external_agent",
    },
  ]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
  const records = await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: result.id });
  expect(records.edges.map(({ node }) => node)).toMatchObject([
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
  ]);
});

test("removes a parsed source and its people without deleting unrelated files", async ({
  orm,
  seed,
  transact,
}) => {
  const keep = await seed.file({ content: Buffer.from("keep"), mimeType: "text/plain" });
  const imports = importUseCases(orm);
  const { id } = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone" }],
    }),
  );

  await imports.files.removeFile(SETUP_HOLDER, id);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([keep]);
});

test("refuses retrying a parsed source", async ({ orm, transact }) => {
  const imports = importUseCases(orm);
  const { id } = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone" }],
    }),
  );
  const before = await imports.reads.listEmployees(SETUP_HOLDER, {});

  await expect(imports.files.retryFile(SETUP_HOLDER, id)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  expect(await imports.reads.listEmployees(SETUP_HOLDER, {})).toEqual(before);
  expect(imports.sentJobs).toEqual([]);
});

test("counts people without a name or valid email as skipped", async ({ orm, transact }) => {
  const imports = importUseCases(orm);

  const result = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [
        {},
        { jobTitle: "Designer" },
        { email: "not an email" },
        { fullName: "Avery Stone" },
        { email: "robin@example.com" },
      ],
    }),
  );

  expect(result).toMatchObject({ people: 2, skipped: 3 });
  expect(
    (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: result.id })).edges,
  ).toHaveLength(2);
});

test("prefers supplied name parts over a full name", async ({ orm, transact }) => {
  const imports = importUseCases(orm);

  const { id } = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ fullName: "Ignored Name", firstName: "Avery", lastName: "Stone" }],
    }),
  );

  expect(
    (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).edges,
  ).toMatchObject([{ node: { firstName: "Avery", lastName: "Stone" } }]);
});

test("normalizes blank values to null", async ({ orm, transact }) => {
  const imports = importUseCases(orm);

  const { id } = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ firstName: "Avery", lastName: " ", email: " ", jobTitle: " ", startDate: " " }],
    }),
  );

  expect(
    (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).edges,
  ).toMatchObject([
    { node: { firstName: "Avery", lastName: null, email: null, jobTitle: null, startDate: null } },
  ]);
});

test.for([
  { input: "2024-02-29", expected: "2024-02-29" },
  { input: "2025-02-29", expected: null },
  { input: "2026-04-31", expected: null },
  { input: "2026-13-01", expected: null },
  { input: "02/03/2026", expected: null },
])(
  "parses the calendar date $input as $expected",
  async ({ input, expected }, { orm, transact }) => {
    const imports = importUseCases(orm);

    const { id } = await transact((tx) =>
      imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
        name: "staff.pdf",
        people: [{ fullName: "Avery Stone", startDate: input }],
      }),
    );

    expect(
      (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).edges,
    ).toMatchObject([{ node: { startDate: expected } }]);
  },
);

test("drops control characters from a parsed source name", async ({ orm, transact }) => {
  const imports = importUseCases(orm);

  const { id } = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff\u0000\u0007.pdf",
      people: [{ fullName: "Avery Stone" }],
    }),
  );

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([{ id, name: "staff.pdf" }]);
});

test("accepts the 200-character field boundary", async ({ orm, transact }) => {
  const imports = importUseCases(orm);
  const jobTitle = "x".repeat(200);

  const { id } = await transact((tx) =>
    imports.parsedSources.addParsedSource(SETUP_AGENT, tx, {
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", jobTitle }],
    }),
  );

  expect(
    (await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).edges,
  ).toMatchObject([{ node: { jobTitle } }]);
});
