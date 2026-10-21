import { expect, importUseCases, OWNER, test } from "#test/support";

test.for(["b@example.com", "B@EXAMPLE.COM", " B@EXAMPLE.COM "])(
  "refuses another import employee’s email %s without changing either employee",
  async (value, { orm, seed }) => {
    const source = await seed.importSource();
    await seed.importEmployees(source.id, [{ email: "a@example.com" }, { email: "b@example.com" }]);
    const imports = importUseCases(orm);
    const before = (await imports.reads.readReview(OWNER)).listEmployees({});

    await expect(
      imports.choices.chooseEmployeeValue(OWNER, {
        key: "a@example.com",
        field: "email",
        choice: { value },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "value", code: "taken" }],
    });
    expect((await imports.reads.readReview(OWNER)).listEmployees({})).toEqual(before);
  },
);

test("allows typing the import employee’s current email", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);

  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "email",
    choice: { value: " AVERY@EXAMPLE.COM " },
  });

  const page = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(page.edges.map(({ node }) => node.values.email)).toMatchObject([
    { value: "avery@example.com", choice: "typed" },
  ]);
});

test("keeps a merge from a re-read left out after an email edit", async ({ orm, seed }) => {
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const [row] = await seed.importEmployees(file.id, [{ email: null }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: `record:${row!.id}`,
    field: "email",
    choice: { value: "b@example.com" },
  });
  const slack = await seed.importSource();
  await seed.importEmployees(slack.id, [{ email: "b@example.com" }]);
  const merged = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(merged.edges).toHaveLength(1);
  expect(merged.edges[0]!.node.records).toHaveLength(2);
  await imports.choices.setLeftOut(OWNER, { key: "b@example.com", leftOut: true });

  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "b@example.com",
    field: "email",
    choice: { value: "c@example.com" },
  });

  const page = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(page.edges.map(({ node }) => node)).toMatchObject([
    { leftOut: true, values: { email: { value: "c@example.com", choice: "typed" } } },
  ]);
  expect(page.edges[0]!.node.records).toHaveLength(2);
});

test.for(["default", "record"] as const)(
  "refuses restoring a %s email that another person now uses",
  async (restore, { orm, seed }) => {
    const source = await seed.importSource();
    const [avery] = await seed.importEmployees(source.id, [
      { email: "avery@example.com" },
      { email: "robin@example.com" },
    ]);
    const imports = importUseCases(orm);
    await imports.choices.chooseEmployeeValue(OWNER, {
      key: "avery@example.com",
      field: "email",
      choice: { value: "avery.new@example.com" },
    });
    await imports.choices.chooseEmployeeValue(OWNER, {
      key: "robin@example.com",
      field: "email",
      choice: { value: "avery@example.com" },
    });
    const before = await imports.reads.readReview(OWNER);

    await expect(
      imports.choices.chooseEmployeeValue(OWNER, {
        key: "avery@example.com",
        field: "email",
        choice: restore === "default" ? null : { recordId: avery!.id },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "value", code: "taken" }],
    });

    const after = await imports.reads.readReview(OWNER);
    expect(after.listEmployees({})).toEqual(before.listEmployees({}));
    expect(after.readyEmployees).toEqual(before.readyEmployees);
  },
);

test("refuses an undo that would restore a taken email from a merged person", async ({
  orm,
  seed,
}) => {
  const source = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "casey@example.com" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "email",
    choice: { value: "robin@example.com" },
  });
  const added = await seed.importSource();
  await seed.importEmployees(added.id, [{ email: "robin@example.com" }]);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "casey@example.com",
    field: "email",
    choice: { value: "avery@example.com" },
  });
  const before = (await imports.reads.readReview(OWNER)).listEmployees({});

  await expect(
    imports.choices.chooseEmployeeValue(OWNER, {
      key: "robin@example.com",
      field: "email",
      choice: null,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "value", code: "taken" }],
  });

  expect((await imports.reads.readReview(OWNER)).listEmployees({})).toEqual(before);
});
