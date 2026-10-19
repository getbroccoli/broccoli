import { vi } from "vitest";

import {
  expect,
  importUseCases,
  OWNER,
  PNG,
  slackPhotoReader,
  SLACK_PHOTO_URL,
  storedFileIds,
  SYSTEM,
  test,
} from "#test/support";

import { instanceRepository } from "../../../../core/instance";

test("attaches the photos still missing after the record cursor", async ({ orm, seed }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(source.id, [
    { photoUrl: SLACK_PHOTO_URL },
    { photoUrl: SLACK_PHOTO_URL },
    { photoUrl: SLACK_PHOTO_URL },
    {},
  ]);
  const [before, stored] = records.toSorted((a, b) => a.id.localeCompare(b.id));
  const storedId = await seed.importPhoto(stored!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader(), readSlackPhoto } });

  await imports.downloadSlackPhotos(SYSTEM, { sourceId: source.id, after: before!.id });

  const employees = await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id });
  const photoIds = employees.edges.map(({ node }) => node.photoFileId);
  expect(photoIds[2]).toEqual(expect.any(String));
  expect(photoIds).toEqual([null, storedId, photoIds[2], null]);
  expect(readSlackPhoto).toHaveBeenCalledExactlyOnceWith(SYSTEM, new URL(SLACK_PHOTO_URL));
  expect(await storedFileIds(orm)).toHaveLength(2);
  expect(imports.sentJobs).toEqual([]);
});

test("continues after a full batch of 40 with the last record id", async ({ orm, seed }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const source = await seed.importSource();
  const records = await seed.importEmployees(
    source.id,
    Array.from({ length: 41 }, () => ({ photoUrl: SLACK_PHOTO_URL })),
  );
  const ordered = records.toSorted((a, b) => a.id.localeCompare(b.id));
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader(), readSlackPhoto } });

  await imports.downloadSlackPhotos(SYSTEM, { sourceId: source.id, after: null });

  const employees = await imports.reads.listEmployeeRecords(OWNER, {
    sourceId: source.id,
    first: 41,
  });
  expect(
    employees.edges.filter(({ node }) => node.photoFileId !== null).map(({ node }) => node.id),
  ).toEqual(ordered.slice(0, 40).map(({ id }) => id));
  expect(employees.edges[40]!.node.photoFileId).toBeNull();
  expect(readSlackPhoto).toHaveBeenCalledTimes(40);
  expect(await storedFileIds(orm)).toHaveLength(40);
  expect(imports.sentJobs).toEqual([
    {
      name: "imports.downloadSlackPhotos",
      payload: { sourceId: source.id, after: ordered[39]!.id },
    },
  ]);
});

test.for(["owner", "done"] as const)(
  "downloads nothing at the %s step",
  async (step, { orm, seed }) => {
    const owner = await seed.owner();
    await instanceRepository(orm).setOwner(owner.user!.userId, step);
    const source = await seed.importSource();
    const records = await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
    const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
    const imports = importUseCases(orm, { slack: { ...slackPhotoReader(), readSlackPhoto } });

    await imports.downloadSlackPhotos(SYSTEM, { sourceId: source.id, after: null });

    expect(readSlackPhoto).not.toHaveBeenCalled();
    expect(
      (await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id })).edges.map(
        ({ node }) => node,
      ),
    ).toEqual(records);
    expect(await storedFileIds(orm)).toEqual([]);
    expect(imports.sentJobs).toEqual([]);
  },
);

test("a second photo job run adds no files", async ({ orm, seed }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [{ photoUrl: SLACK_PHOTO_URL }]);
  const imports = importUseCases(orm, { slack: slackPhotoReader() });
  await imports.downloadSlackPhotos(SYSTEM, { sourceId: source.id, after: null });
  const firstFiles = await storedFileIds(orm);
  expect(firstFiles).toHaveLength(1);
  const firstEmployees = await imports.reads.listEmployees(OWNER, {});

  await imports.downloadSlackPhotos(SYSTEM, { sourceId: source.id, after: null });

  expect(await storedFileIds(orm)).toEqual(firstFiles);
  expect(await imports.reads.listEmployees(OWNER, {})).toEqual(firstEmployees);
});
