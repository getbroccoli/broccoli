import { expect, importUseCases, OWNER, SYSTEM, test } from "#test/support";

test("stores a mapped file's manager references and own IDs", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const source = await seed.fileSource({
    content:
      "Name,Email,Employee ID,Manager ID\nAvery Stone,avery@example.com, EMP-1 , EMP-2 \nRobin Reed,robin@example.com,EMP-2,",
  });
  fake.answer({ headerRow: "1", fullName: "A", email: "B", externalRecordId: "C", manager: "D" });
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await imports.files.mapFile(SYSTEM, { sourceId: source.id, attempt: 0 });

  const { edges } = await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id });
  expect(
    edges.map(({ node }) => ({
      email: node.email,
      manager: node.manager,
      externalRecordId: node.externalRecordId,
    })),
  ).toEqual([
    { email: "avery@example.com", manager: "EMP-2", externalRecordId: "EMP-1" },
    { email: "robin@example.com", manager: null, externalRecordId: "EMP-2" },
  ]);
});
