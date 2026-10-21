import { expect, fakeSlackApi, importUseCases, OWNER, SETUP_HOLDER, test } from "#test/support";

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

test("reading Slack again keeps choices and refuses Undo from before the refresh", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const imports = importUseCases(orm, {
    slackApi: fakeSlackApi([
      { id: "U1", profile: { first_name: "Avery", email: "avery@example.com" } },
    ]),
  });
  await imports.readSlack(OWNER);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;

  await imports.readSlack(OWNER);

  const review = await imports.reads.readReview(OWNER);
  expect(review.latestReviewChange).toBeNull();
  expect(review.listEmployees({}).edges[0]!.node.values.jobTitle).toMatchObject({
    value: "Lead",
    choice: "typed",
  });
  await expect(imports.choices.undoReviewChange(OWNER, { id: latest.id })).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Review changed since; nothing was undone.",
  });
  const after = await imports.reads.readReview(OWNER);
  expect(after.listEmployees({})).toEqual(review.listEmployees({}));
  expect(after.latestReviewChange).toBeNull();
  expect(after.version).toBe(review.version);
});
