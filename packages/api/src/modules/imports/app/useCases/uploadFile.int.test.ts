import { expect, importUseCases, OWNER, storedFileIds, test } from "#test/support";

import { files } from "../../../../core/files";
import { instanceRepository } from "../../../../core/instance";

test("stores a mapping source named after the file and sends its first job", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const bytes = Buffer.from("Name,Email\nAvery Stone,avery@example.com");

  const sourceId = await imports.uploadFile(OWNER, { name: "staff.csv", bytes });

  expect(await imports.listSources(OWNER)).toMatchObject([
    { id: sourceId, kind: "file", name: "staff.csv", status: "mapping", failure: null },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId, attempt: 0 } },
  ]);
  expect(
    await orm.select({ content: files.content, mimeType: files.mimeType }).from(files),
  ).toEqual([{ content: bytes, mimeType: "text/csv" }]);
});

test("refuses an upload without a model key", async ({ orm }) => {
  const imports = importUseCases(orm);

  await expect(
    imports.uploadFile(OWNER, { name: "staff.csv", bytes: Buffer.from("Name\nAvery Stone") }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Reading files needs a model key." });

  expect(await imports.listSources(OWNER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses an upload after setup is complete without storing anything or sending a job", async ({
  orm,
  seed,
  fakeDecisions: fake,
}) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "done");
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await expect(
    imports.uploadFile(owner, { name: "staff.csv", bytes: Buffer.from("Name\nAvery Stone") }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "Setup is complete." });

  expect(await imports.listSources(owner)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses a NUL byte as not_csv without storing the file", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await expect(
    imports.uploadFile(OWNER, { name: "staff.csv", bytes: Buffer.from("Name\nAvery\0") }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "file", code: "not_csv" }],
  });

  expect(await imports.listSources(OWNER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});
