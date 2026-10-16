import { expect, importUseCases, OWNER, test } from "#test/support";

test("lists conflict kinds before incomplete kinds with counts and file sources first", async ({
  orm,
  seed,
}) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  await seed.importEmployees(slack.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com", jobTitle: "Engineer" },
    { firstName: "Robin", lastName: "Reed", email: "robin@example.com", jobTitle: "Engineer" },
    { firstName: null },
    { lastName: null },
    { email: null },
    { jobTitle: "x".repeat(101) },
  ]);
  await seed.importEmployees(file.id, [
    { firstName: "Ave", lastName: "Stone", email: "avery@example.com", jobTitle: "Designer" },
    { firstName: "Robin", lastName: "Reed", email: "robin@example.com", jobTitle: "Designer" },
  ]);
  const imports = importUseCases(orm);

  const checks = await imports.reads.listChecks(OWNER);

  expect(checks).toEqual([
    {
      id: "conflict:firstName",
      kind: "conflict",
      field: "firstName",
      count: 1,
      sourceIds: [file.id, slack.id],
    },
    {
      id: "conflict:jobTitle",
      kind: "conflict",
      field: "jobTitle",
      count: 2,
      sourceIds: [file.id, slack.id],
    },
    { id: "incomplete:firstName", kind: "incomplete", reason: "firstName", count: 1 },
    { id: "incomplete:lastName", kind: "incomplete", reason: "lastName", count: 1 },
    { id: "incomplete:email", kind: "incomplete", reason: "email", count: 1 },
    { id: "incomplete:other", kind: "incomplete", reason: "other", count: 1 },
  ]);
});

test("does not count settled conflicts or left-out import employees", async ({ orm, seed }) => {
  const slack = await seed.importSource();
  const file = await seed.fileSource({ content: "x", status: "mapped" });
  const records = [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com", jobTitle: "Engineer" },
    { firstName: "Robin", lastName: null, email: "robin@example.com", jobTitle: "Engineer" },
  ];
  await seed.importEmployees(slack.id, records);
  await seed.importEmployees(
    file.id,
    records.map((record) => ({ ...record, jobTitle: "Designer" })),
  );
  const imports = importUseCases(orm);
  await imports.choices.chooseEmployeeValue(OWNER, {
    key: "avery@example.com",
    field: "jobTitle",
    choice: { value: "Lead" },
  });
  await imports.choices.setLeftOut(OWNER, { key: "robin@example.com", leftOut: true });

  expect(await imports.reads.listChecks(OWNER)).toEqual([]);
});
