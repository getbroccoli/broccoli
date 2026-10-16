import { expect, importUseCases, OWNER, test } from "#test/support";

test("stores a record pick for a later read", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const [member] = await seed.importEmployees(slack.id, [
    { email: "avery@example.com", jobTitle: "Engineer" },
  ]);
  await seed.importEmployees(file.id, [{ email: "avery@example.com", jobTitle: "Designer" }]);
  const imports = importUseCases(orm);

  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { recordId: member!.id },
  });

  const page = await importUseCases(orm).reads.listEmployees(OWNER, {});
  expect(page.edges[0]!.node.values.jobTitle).toMatchObject({
    value: "Engineer",
    choice: "picked",
  });
});

test("clears a choice back to the source default", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com", jobTitle: "Engineer" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });

  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: null,
  });

  const page = await imports.reads.listEmployees(OWNER, {});
  expect(page.edges[0]!.node.values.jobTitle).toMatchObject({
    value: "Engineer",
    choice: "default",
  });
});

test("stores a typed value that fixes an incomplete import employee", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com", lastName: null }]);
  const imports = importUseCases(orm);

  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "lastName",
    choice: { value: "Stone" },
  });

  const reads = importUseCases(orm).reads;
  const page = await reads.listEmployees(OWNER, {});
  expect(page.edges[0]!.node.values.lastName).toMatchObject({ value: "Stone", choice: "typed" });
  expect(await reads.readyEmployeeCount(OWNER)).toBe(1);
});

test("refuses a choice for an unknown import employee", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(
    imports.choices.chooseEmployeeValue(OWNER, {
      key: "missing@example.com",
      field: "jobTitle",
      choice: { value: "Lead" },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "employeeId", code: "not_found" }],
  });
});

test("refuses a record belonging to another import employee", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
  ]);
  const imports = importUseCases(orm);

  await expect(
    imports.choices.chooseEmployeeValue(OWNER, {
      key: "avery@example.com",
      field: "firstName",
      choice: { recordId: records[1]!.id },
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "recordId", code: "not_found" }],
  });
});

test.for([
  { field: "email", value: "avery@", code: "invalid" },
  { field: "firstName", value: "a".repeat(101), code: "too_long" },
  { field: "lastName", value: "   ", code: "required" },
] as const)(
  "refuses a typed $field with the employee rule’s $code error",
  async ({ field, value, code }, { orm, seed }) => {
    const source = await seed.importSource();
    await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
    const imports = importUseCases(orm);
    const before = await imports.reads.listEmployees(OWNER, {});

    await expect(
      imports.choices.chooseEmployeeValue(OWNER, {
        key: "avery@example.com",
        field,
        choice: { value },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "value", code }],
    });
    expect(await imports.reads.listEmployees(OWNER, {})).toEqual(before);
  },
);

test("chooses a source for open conflicts while keeping settled values and groups without that source", async ({
  orm,
  seed,
}) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const otherFile = await seed.fileSource({ content: "x", status: "mapped", name: "other.csv" });
  await seed.importEmployees(file.id, [
    { email: "open@example.com", jobTitle: "Designer" },
    { email: "settled@example.com", jobTitle: "Designer" },
    { email: "absent@example.com", jobTitle: "Designer" },
    { email: "empty@example.com", jobTitle: "Designer" },
  ]);
  await seed.importEmployees(slack.id, [
    { email: "open@example.com", jobTitle: "Engineer" },
    { email: "settled@example.com", jobTitle: "Engineer" },
    { email: "empty@example.com", jobTitle: null },
  ]);
  await seed.importEmployees(otherFile.id, [
    { email: "absent@example.com", jobTitle: "Manager" },
    { email: "empty@example.com", jobTitle: "Manager" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "settled@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });

  await imports.choices.chooseSourceForAll(OWNER, { field: "jobTitle", sourceId: slack.id });

  const page = await imports.reads.listEmployees(OWNER, {
    orderBy: { field: "EMAIL", direction: "ASC" },
  });
  expect(
    page.edges.map(({ node }) => ({ key: node.key, title: node.values.jobTitle })),
  ).toMatchObject([
    { key: "absent@example.com", title: { value: "Designer", choice: "default" } },
    { key: "empty@example.com", title: { value: "Designer", choice: "default" } },
    { key: "open@example.com", title: { value: "Engineer", choice: "picked" } },
    { key: "settled@example.com", title: { value: "Lead", choice: "typed" } },
  ]);
});

test("stores leaving an import employee out and adding it back", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);

  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: true });

  expect((await importUseCases(orm).reads.listEmployees(OWNER, {})).edges[0]!.node.leftOut).toBe(
    true,
  );
  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: false });
  expect((await importUseCases(orm).reads.listEmployees(OWNER, {})).edges[0]!.node.leftOut).toBe(
    false,
  );
});

test("leaves out only import employees with the requested incomplete reason", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "first@example.com", lastName: null },
    { email: "second@example.com", lastName: null },
    { email: "third@example.com", firstName: null },
    { email: "ready@example.com" },
  ]);
  const imports = importUseCases(orm);

  await imports.choices.leaveOutIncomplete(OWNER, { reason: "lastName" });

  const page = await importUseCases(orm).reads.listEmployees(OWNER, {
    orderBy: { field: "EMAIL", direction: "ASC" },
  });
  expect(page.edges.map(({ node }) => ({ key: node.key, leftOut: node.leftOut }))).toEqual([
    { key: "first@example.com", leftOut: true },
    { key: "ready@example.com", leftOut: false },
    { key: "second@example.com", leftOut: true },
    { key: "third@example.com", leftOut: false },
  ]);
});

test("keeps a record pick after Slack re-reads the same member", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const [member] = await seed.importEmployees(slack.id, [
    { externalId: "U1", email: "avery@example.com", jobTitle: "Engineer" },
  ]);
  await seed.importEmployees(file.id, [{ email: "avery@example.com", jobTitle: "Designer" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { recordId: member!.id },
  });

  await seed.importEmployees(slack.id, [
    { externalId: "U1", email: "avery@example.com", jobTitle: "Lead engineer" },
  ]);

  const page = await importUseCases(orm).reads.listEmployees(OWNER, {});
  expect(page.edges[0]!.node.values.jobTitle).toMatchObject({
    value: "Lead engineer",
    choice: "picked",
  });
});

test("falls back to the default when the file containing a picked record is removed", async ({
  orm,
  seed,
}) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [{ email: "avery@example.com", jobTitle: "Engineer" }]);
  const [row] = await seed.importEmployees(file.id, [
    { email: "avery@example.com", jobTitle: "Designer" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { recordId: row!.id },
  });

  await imports.files.removeFile(OWNER, file.id);

  const page = await importUseCases(orm).reads.listEmployees(OWNER, {});
  expect(page.edges[0]!.node.values.jobTitle).toMatchObject({
    value: "Engineer",
    choice: "default",
  });
});
