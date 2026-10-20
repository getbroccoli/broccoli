import { expect, importUseCases, SETUP_HOLDER, SYSTEM, test } from "#test/support";

test("retries a waiting answered file through the model with the next attempt", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content: "Name,Email\nAvery Stone,avery@example.com",
    readBy: "answered_by_external_agent",
  });
  fake.answer({ headerRow: "1", fullName: "A", email: "B" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.retryFile(SETUP_HOLDER, source.id);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toMatchObject([
    { id: source.id, readBy: "parsed_by_broccoli", status: "mapping" },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId: source.id, attempt: 1 } },
  ]);
  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 1 });
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toMatchObject([
    { node: { values: { email: { value: "avery@example.com" } } } },
  ]);
});
