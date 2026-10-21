import { sql } from "drizzle-orm";

import { expect, importUseCases, OWNER, test } from "#test/support";

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

test("undo restores the earlier typed value when UUID order differs from change order", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com", jobTitle: "Engineer" }]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  const first = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Manager" },
  });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await orm.execute(
    sql`update import_review_changes set id = 'ffffffff-ffff-7fff-bfff-ffffffffffff' where id = ${first.id}`,
  );

  expect((await imports.reads.readReview(OWNER)).latestReviewChange).toEqual(latest);
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

test("undo includes a left-out employee again and clears the last review change", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ email: "avery@example.com" }]);
  const imports = importUseCases(orm);
  await imports.choices.setLeftOut(OWNER, { key: "avery@example.com", leftOut: true });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;

  await imports.choices.undoReviewChange(OWNER, { id: latest.id });

  const review = await imports.reads.readReview(OWNER);
  expect(review.listEmployees({}).edges[0]!.node.leftOut).toBe(false);
  expect(review.latestReviewChange).toBeNull();
});

test("undo restores a bulk leave-out while keeping earlier choices and history", async ({
  orm,
  seed,
}) => {
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { email: "avery@example.com", lastName: null },
    { email: "robin@example.com", lastName: null },
  ]);
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  const earlier = (await imports.reads.readReview(OWNER)).latestReviewChange!;
  await imports.choices.leaveOutIncomplete(OWNER, { reason: "lastName" });
  const latest = (await imports.reads.readReview(OWNER)).latestReviewChange!;

  await imports.choices.undoReviewChange(OWNER, { id: latest.id });

  const review = await imports.reads.readReview(OWNER);
  const page = review.listEmployees({ orderBy: { field: "EMAIL", direction: "ASC" } });
  expect(
    page.edges.map(({ node }) => ({ leftOut: node.leftOut, title: node.values.jobTitle })),
  ).toMatchObject([
    { leftOut: false, title: { value: "Lead", choice: "typed" } },
    { leftOut: false, title: { value: null, choice: "default" } },
  ]);
  expect(review.latestReviewChange).toEqual(earlier);
});
