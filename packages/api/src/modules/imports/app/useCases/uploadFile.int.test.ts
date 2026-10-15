import { onTestFinished } from "vitest";

import {
  expect,
  importUseCases,
  OWNER,
  startFakeDecisions,
  storedFileIds,
  test,
} from "#test/support";

import { files } from "../../../../core/files";

test("stores a mapping source named after the file and sends its first job", async ({ orm }) => {
  const fake = await startFakeDecisions();
  onTestFinished(() => fake.stop());
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

test("refuses a NUL byte as not_csv without storing the file", async ({ orm }) => {
  const fake = await startFakeDecisions();
  onTestFinished(() => fake.stop());
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
