import { strToU8, zipSync } from "fflate";

import {
  expect,
  importUseCases,
  OWNER,
  storedFileIds,
  SYSTEM,
  test,
  sampleXlsxFile,
  xlsxFileWithDistantCell,
} from "#test/support";

import { files } from "../../../../core/files";
import { instanceRepository } from "../../../../core/instance";

test("stores a mapping source named after the file and sends its first job", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const bytes = Buffer.from("Name,Email\nAvery Stone,avery@example.com");

  const sourceId = await imports.files.uploadFile(OWNER, { name: "staff.csv", bytes });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
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
    imports.files.uploadFile(OWNER, { name: "staff.csv", bytes: Buffer.from("Name\nAvery Stone") }),
  ).rejects.toMatchObject({ code: "UNAVAILABLE", message: "Reading files needs a model key." });

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses a second upload while the first is being read without storing anything or sending a job", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const bytes = sampleXlsxFile({ sheets: [{ name: "Staff", rows: [["Name"], ["Avery Stone"]] }] });
  const first = Promise.allSettled([
    imports.files.uploadFile(OWNER, { name: "slow.xlsx", bytes: xlsxFileWithDistantCell() }),
  ]);

  try {
    await expect(
      imports.files.uploadFile(OWNER, { name: "staff.xlsx", bytes }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });

    expect(await imports.reads.listSources(OWNER)).toEqual([]);
    expect(await storedFileIds(orm)).toEqual([]);
    expect(imports.sentJobs).toEqual([]);
  } finally {
    expect(await first).toMatchObject([
      {
        status: "rejected",
        reason: {
          code: "INVALID_INPUT",
          fieldErrors: [{ field: "file", code: "unsupported_file" }],
        },
      },
    ]);
  }
});

test("accepts the next upload after the first upload finishes with an unreadable workbook", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const bytes = sampleXlsxFile({ sheets: [{ name: "Staff", rows: [["Name"], ["Avery Stone"]] }] });
  await expect(
    imports.files.uploadFile(OWNER, { name: "slow.xlsx", bytes: xlsxFileWithDistantCell() }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "file", code: "unsupported_file" }],
  });

  const sourceId = await imports.files.uploadFile(OWNER, { name: "staff.xlsx", bytes });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: sourceId, kind: "file", name: "staff.xlsx", status: "mapping" },
  ]);
  expect(await storedFileIds(orm)).toHaveLength(1);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId, attempt: 0 } },
  ]);
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
    imports.files.uploadFile(owner, { name: "staff.csv", bytes: Buffer.from("Name\nAvery Stone") }),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "Setup is complete." });

  expect(await imports.reads.listSources(owner)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses a NUL byte as unsupported without storing the file", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });

  await expect(
    imports.files.uploadFile(OWNER, { name: "staff.csv", bytes: Buffer.from("Name\nAvery\0") }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "file", code: "unsupported_file" }],
  });

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

test("fails the file when its current attempt is exhausted", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", attempt: 2 });
  const imports = importUseCases(orm);

  await imports.files.markFileFailed(SYSTEM, { sourceId: source.id, attempt: 2 });

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "failed", failure: "unavailable" },
  ]);
});

test("a stale failure leaves the source unchanged", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", attempt: 2 });
  const imports = importUseCases(orm);

  await imports.files.markFileFailed(SYSTEM, { sourceId: source.id, attempt: 1 });

  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
});

test("restarts a failed file with the next attempt", async ({ orm, seed }) => {
  const source = await seed.fileSource({
    content: "Name\nAvery Stone",
    status: "failed",
    failure: "unavailable",
  });
  const imports = importUseCases(orm);

  await imports.files.retryFile(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toMatchObject([
    { id: source.id, status: "mapping", failure: null },
  ]);
  expect(imports.sentJobs).toEqual([
    { name: "imports.mapFile", payload: { sourceId: source.id, attempt: 1 } },
  ]);
});

test("leaves a mapped file unchanged without sending a job", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const imports = importUseCases(orm);

  await imports.files.retryFile(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
  expect(imports.sentJobs).toEqual([]);
});

test("refuses a retry after setup is complete without changing the source or sending a job", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await instanceRepository(orm).setOwner(owner.user!.userId, "done");
  const source = await seed.fileSource({
    content: "Name\nAvery Stone",
    status: "failed",
    failure: "unavailable",
  });
  const imports = importUseCases(orm);

  await expect(imports.files.retryFile(owner, source.id)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Setup is complete.",
  });

  expect(await imports.reads.listSources(owner)).toEqual([source]);
  expect(imports.sentJobs).toEqual([]);
});

test("removes the source, its records and its stored file", async ({ orm, seed }) => {
  const source = await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  await seed.importEmployees(source.id, [{ firstName: "Avery", lastName: "Stone" }]);
  const otherFile = await seed.file({ content: Buffer.from("keep"), mimeType: "text/plain" });
  const imports = importUseCases(orm);

  await imports.files.removeFile(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect((await imports.reads.listEmployees(OWNER, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([otherFile]);
});

test("leaves the Slack source and its records unchanged", async ({ orm, seed }) => {
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [{ firstName: "Avery" }]);
  const imports = importUseCases(orm);

  await imports.files.removeFile(OWNER, source.id);

  expect(await imports.reads.listSources(OWNER)).toEqual([source]);
  expect(
    (await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges.map(
      ({ node }) => node,
    ),
  ).toEqual(records);
});

test("refuses a ZIP without a workbook without storing it or sending a job", async ({
  orm,
  fakeDecisions: fake,
}) => {
  const imports = importUseCases(orm, { decisions: fake.decisions });
  const bytes = zipSync({ "staff.txt": strToU8("Name\nAvery Stone") });

  await expect(
    imports.files.uploadFile(OWNER, { name: "staff.xlsx", bytes }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "file", code: "unsupported_file" }],
  });

  expect(await imports.reads.listSources(OWNER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});
