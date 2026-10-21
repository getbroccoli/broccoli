import sharp from "sharp";
import { vi } from "vitest";

import {
  expect,
  importUseCases,
  JPEG,
  OWNER,
  PNG,
  SETUP_HOLDER,
  fakeSlackApi,
  SLACK_MEMBER_WITH_PHOTO,
  SLACK_PHOTO_URL,
  storedFileIds,
  test,
  WEBP,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { readInstance } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test.for([
  { content: PNG, mimeType: "image/png" },
  { content: JPEG, mimeType: "image/jpeg" },
  { content: WEBP, mimeType: "image/webp" },
])("stores a member's $mimeType photo as WebP", async (photo, { orm, seed }) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const readPhoto = vi.fn(() => Promise.resolve(photo.content));
  const imports = importUseCases(orm, { slackApi: { ...fakeSlackApi(), readPhoto } });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({});
  const [fileId] = await storedFileIds(orm);
  expect(fileId).toEqual(expect.any(String));
  expect(employees.edges.map(({ node }) => node.photoFileId)).toEqual([fileId]);
  const stored = await readFile(orm, fileId!);
  expect(stored?.mimeType).toBe("image/webp");
  expect(await sharp(stored!.content).metadata()).toMatchObject({ format: "webp" });
  expect(readPhoto).toHaveBeenCalledWith(new URL(SLACK_PHOTO_URL));
});

test("keeps a stored photo when Slack's photo link is unchanged", async ({ orm, seed }) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [
    { externalId: "U1", photoUrl: SLACK_PHOTO_URL },
  ]);
  const fileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, { slackApi: { ...fakeSlackApi(), readPhoto } });

  await imports.readSlack(OWNER);

  expect(readPhoto).not.toHaveBeenCalled();
  expect(
    (await imports.reads.readReview(OWNER))
      .listEmployees({})
      .edges.map(({ node }) => node.photoFileId),
  ).toEqual([fileId]);
  expect(await storedFileIds(orm)).toEqual([fileId]);
});

test("replaces a changed Slack photo and deletes its old file", async ({ orm, seed }) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [
    { externalId: "U1", photoUrl: SLACK_PHOTO_URL },
  ]);
  const oldFileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const photoUrl = "https://avatars.slack-edge.com/new-photo.jpg";
  const member = {
    ...SLACK_MEMBER_WITH_PHOTO,
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, image_192: photoUrl },
  };
  const readPhoto = vi.fn(() => Promise.resolve(JPEG));
  const imports = importUseCases(orm, { slackApi: { ...fakeSlackApi([member]), readPhoto } });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({});
  const fileId = employees.edges[0]!.node.photoFileId;
  expect(fileId).toEqual(expect.any(String));
  expect(fileId).not.toBe(oldFileId);
  expect(await storedFileIds(orm)).toEqual([fileId]);
  const stored = await readFile(orm, fileId!);
  expect(stored?.mimeType).toBe("image/webp");
  expect(await sharp(stored!.content).metadata()).toMatchObject({ format: "webp" });
  expect(readPhoto).toHaveBeenCalledExactlyOnceWith(new URL(photoUrl));
});

test("Approve keeps the stored photo while Refresh downloads its replacement", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const source = await seed.importSource();
  const [record] = await seed.importEmployees(source.id, [
    { externalId: "U1", photoUrl: SLACK_PHOTO_URL },
  ]);
  const oldFileId = await seed.importPhoto(record!.id, {
    photoUrl: SLACK_PHOTO_URL,
    content: PNG,
    mimeType: "image/png",
  });
  const member = {
    ...SLACK_MEMBER_WITH_PHOTO,
    profile: {
      ...SLACK_MEMBER_WITH_PHOTO.profile,
      image_192: "https://avatars.slack-edge.com/new-photo.jpg",
    },
  };
  const downloadStarted = Promise.withResolvers<void>();
  const download = Promise.withResolvers<Buffer>();
  const imports = importUseCases(orm, {
    slackApi: {
      ...fakeSlackApi([member]),
      readPhoto: () => {
        downloadStarted.resolve();
        return download.promise;
      },
    },
  });

  const refresh = imports.readSlack(SETUP_HOLDER);
  try {
    await downloadStarted.promise;
    await imports.approveImport(
      SETUP_HOLDER,
      (await imports.reads.readReview(SETUP_HOLDER)).version,
    );
  } finally {
    download.resolve(JPEG);
    await refresh;
  }

  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(employees.edges.map(({ node }) => node.avatarFileId)).toEqual([oldFileId]);
  expect(await storedFileIds(orm)).toEqual([oldFileId]);
});

test("downloads every new photo during the read", async ({ orm, seed }) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, {
    slackApi: { ...fakeSlackApi(photoMembers(60)), readPhoto },
    clock: () => new Date("2026-10-20T12:00:00Z"),
  });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({ first: 100 });
  expect(employees.edges).toHaveLength(60);
  expect(employees.edges.filter(({ node }) => node.photoFileId !== null)).toHaveLength(60);
  expect(readPhoto).toHaveBeenCalledTimes(60);
  expect(await storedFileIds(orm)).toHaveLength(60);
  expect(imports.sentJobs).toEqual([]);
});

test("a later Refresh downloads the photos still missing", async ({ orm, seed }) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const slackApi = { ...fakeSlackApi(photoMembers(40)), readPhoto };
  const startedAt = new Date("2026-10-20T12:00:00Z");
  const imports = importUseCases(orm, {
    slackApi,
    clock: () => new Date(startedAt.getTime() + (readPhoto.mock.calls.length === 0 ? 0 : 21_000)),
  });
  await imports.readSlack(OWNER);
  const firstFiles = await storedFileIds(orm);
  expect(firstFiles).toHaveLength(16);
  readPhoto.mockClear();
  const refresh = importUseCases(orm, {
    slackApi,
    clock: () => new Date("2026-10-20T12:01:00Z"),
  });

  await refresh.readSlack(OWNER);

  const employees = (await refresh.reads.readReview(OWNER)).listEmployees({ first: 100 });
  const files = await storedFileIds(orm);
  expect(employees.edges).toHaveLength(40);
  expect(employees.edges.filter(({ node }) => node.photoFileId !== null)).toHaveLength(40);
  expect(readPhoto).toHaveBeenCalledTimes(24);
  expect(files).toHaveLength(40);
  expect(files).toEqual(expect.arrayContaining(firstFiles));
  expect(imports.sentJobs).toEqual([]);
  expect(refresh.sentJobs).toEqual([]);
});

test("a Slack read after Approve writes nothing", async ({ orm, seed }) => {
  await seed.slackConnection();
  await seed.setupStep("import");
  const imports = importUseCases(orm, { slackApi: fakeSlackApi() });
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);
  expect((await readInstance(orm)).step).toBe("owner");

  await imports.readSlack(SETUP_HOLDER);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

function photoMembers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...SLACK_MEMBER_WITH_PHOTO,
    id: `U${index}`,
    profile: {
      ...SLACK_MEMBER_WITH_PHOTO.profile,
      email: `employee${index}@example.com`,
      image_192: `https://avatars.slack-edge.com/photo-${index}.png`,
    },
  }));
}
