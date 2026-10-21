import { expect, importUseCases, OWNER, SETUP_HOLDER, test } from "#test/support";

test("undoes email changes latest first back to two employees with default emails", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com" },
    { email: "robin@example.com" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "email",
    choice: { value: "c@example.com" },
  });
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "robin@example.com",
    field: "email",
    choice: { value: "avery@example.com" },
  });

  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.undoReviewChange(OWNER, { id: latest.id });
  const previous = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.undoReviewChange(OWNER, { id: previous.id });

  const review = await imports.reads.readReview(OWNER);
  const page = review.listEmployees({ orderBy: { field: "EMAIL", direction: "ASC" } });
  expect(page.edges.map(({ node }) => node.values.email)).toMatchObject([
    { value: "avery@example.com", choice: "default" },
    { value: "robin@example.com", choice: "default" },
  ]);
  expect(review.latestReviewChange).toBeNull();
});

test("undo restores the earlier typed value", async ({ orm, seed }) => {
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
    choice: { value: "Manager" },
  });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;

  await imports.choices.undoReviewChange(OWNER, { id: latest.id });

  const page = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(page.edges[0]!.node.values.jobTitle).toMatchObject({ value: "Lead", choice: "typed" });
});

test("undo reverses a bulk source pick in one change", async ({ orm, seed }) => {
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const slack = await seed.importSource();
  await seed.importEmployees(file.id, [
    { email: "avery@example.com", jobTitle: "Designer" },
    { email: "robin@example.com", jobTitle: "Designer" },
  ]);
  await seed.importEmployees(slack.id, [
    { email: "avery@example.com", jobTitle: "Engineer" },
    { email: "robin@example.com", jobTitle: "Engineer" },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseSourceForAll(OWNER, { field: "jobTitle", sourceId: slack.id });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;

  await imports.choices.undoReviewChange(OWNER, { id: latest.id });

  const review = await imports.reads.readReview(OWNER);
  expect(review.listEmployees({}).edges.map(({ node }) => node.values.jobTitle)).toMatchObject([
    { value: "Designer", choice: "default" },
    { value: "Designer", choice: "default" },
  ]);
  expect(review.latestReviewChange).toBeNull();
});

test("undoing an email edit keeps a re-read import employee merged", async ({ orm, seed }) => {
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
  const before = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(before.edges).toHaveLength(1);
  expect(before.edges[0]!.node.records).toHaveLength(2);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "b@example.com",
    field: "email",
    choice: { value: "c@example.com" },
  });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;

  await imports.choices.undoReviewChange(OWNER, { id: latest.id });

  const page = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(page.edges).toHaveLength(1);
  expect(page.edges[0]!.node.records).toEqual(before.edges[0]!.node.records);
  expect(page.edges[0]!.node.values.email.value).toBe("b@example.com");
});

test("refuses undo of an earlier change without changing review", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  const earlier = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Manager" },
  });
  const before = await imports.reads.readReview(OWNER);

  await expect(imports.choices.undoReviewChange(OWNER, { id: earlier.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Review changed since; nothing was undone.",
  });

  const after = await imports.reads.readReview(OWNER);
  expect(after.listEmployees({})).toEqual(before.listEmployees({}));
  expect(after.latestReviewChange).toEqual(before.latestReviewChange);
  expect(after.version).toBe(before.version);
});

test("refuses undo of the same change twice and keeps the earlier choice", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  const earlier = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Manager" },
  });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.undoReviewChange(OWNER, { id: latest.id });

  await expect(imports.choices.undoReviewChange(OWNER, { id: latest.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Review changed since; nothing was undone.",
  });

  const review = await imports.reads.readReview(OWNER);
  expect(review.listEmployees({}).edges[0]!.node.values.jobTitle).toMatchObject({
    value: "Lead",
    choice: "typed",
  });
  expect(review.latestReviewChange).toEqual(earlier);
});

test("removing another file clears review history and keeps the current choice", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(file.id, [{ email: "robin@example.com" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  expect((await imports.reads.readReview(OWNER)).latestReviewChange).toMatchObject({
    id: expect.any(String) as unknown,
  });

  await imports.files.removeFile(OWNER, file.id);

  const review = await imports.reads.readReview(OWNER);
  expect(review.latestReviewChange).toBeNull();
  expect(review.listEmployees({}).edges.map(({ node }) => node.values.jobTitle)).toMatchObject([
    { value: "Lead", choice: "typed" },
  ]);
});

test("records no review change when an employee stays included", async ({ orm, seed }) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);

  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: false });

  const review = await imports.reads.readReview(OWNER);
  expect(review.latestReviewChange).toBeNull();
  expect(review.listEmployees({}).edges[0]!.node.leftOut).toBe(false);
});

test("refuses undo after Approve", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(SETUP_HOLDER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  const review = await imports.reads.readReview(SETUP_HOLDER);
  await imports.approveImport(SETUP_HOLDER, review.version);

  await expect(
    imports.choices.undoReviewChange(SETUP_HOLDER, {
      id: review.latestReviewChange!.id,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "Setup is complete." });

  const after = await imports.reads.readReview(SETUP_HOLDER);
  expect(after.listEmployees({})).toEqual(review.listEmployees({}));
});
