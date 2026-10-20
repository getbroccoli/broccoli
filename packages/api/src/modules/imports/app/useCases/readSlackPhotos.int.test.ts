import sharp from "sharp";
import { vi } from "vitest";

import {
  expect,
  importUseCases,
  JPEG,
  OWNER,
  PNG,
  SETUP_HOLDER,
  slackPhotoReader,
  SLACK_MEMBER_WITH_PHOTO,
  SLACK_PHOTO_URL,
  storedFileIds,
  test,
  WEBP,
} from "#test/support";

import { readFile } from "../../../../core/files";
import { readSetupStep } from "../../../../core/instance";
import { createEmployeeUseCases } from "../../../employees";

test.for([
  { content: PNG, mimeType: "image/png" },
  { content: JPEG, mimeType: "image/jpeg" },
  { content: WEBP, mimeType: "image/webp" },
])("stores a member's $mimeType photo as WebP", async (photo, { orm, seed }) => {
  await seed.setupStep("import");
  const readSlackPhoto = vi.fn(() => Promise.resolve(photo.content));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader(), readSlackPhoto } });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({});
  const [fileId] = await storedFileIds(orm);
  expect(fileId).toEqual(expect.any(String));
  expect(employees.edges.map(({ node }) => node.photoFileId)).toEqual([fileId]);
  const stored = await readFile(orm, fileId!);
  expect(stored?.mimeType).toBe("image/webp");
  expect(await sharp(stored!.content).metadata()).toMatchObject({ format: "webp" });
  expect(readSlackPhoto).toHaveBeenCalledWith(OWNER, new URL(SLACK_PHOTO_URL));
});

test("does not download a generated Slack placeholder", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const member = {
    ...SLACK_MEMBER_WITH_PHOTO,
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, is_custom_image: false },
  };
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader([member]), readSlackPhoto } });

  await imports.readSlack(OWNER);

  expect(readSlackPhoto).not.toHaveBeenCalled();
  expect(
    (await imports.reads.readReview(OWNER))
      .listEmployees({})
      .edges.map(({ node }) => node.photoFileId),
  ).toEqual([null]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("a failed photo download leaves initials and the Slack read succeeds", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm, {
    slack: {
      ...slackPhotoReader(),
      readSlackPhoto: () => Promise.reject(new Error("Download failed")),
    },
  });

  await imports.readSlack(OWNER);

  expect(
    (await imports.reads.readReview(OWNER))
      .listEmployees({})
      .edges.map(({ node }) => node.photoFileId),
  ).toEqual([null]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("a non-image download leaves initials", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm, {
    slack: {
      ...slackPhotoReader(),
      readSlackPhoto: () => Promise.resolve(Buffer.from("not an image")),
    },
  });

  await imports.readSlack(OWNER);

  expect(
    (await imports.reads.readReview(OWNER))
      .listEmployees({})
      .edges.map(({ node }) => node.photoFileId),
  ).toEqual([null]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("keeps a stored photo when Slack's photo link is unchanged", async ({ orm, seed }) => {
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
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader(), readSlackPhoto } });

  await imports.readSlack(OWNER);

  expect(readSlackPhoto).not.toHaveBeenCalled();
  expect(
    (await imports.reads.readReview(OWNER))
      .listEmployees({})
      .edges.map(({ node }) => node.photoFileId),
  ).toEqual([fileId]);
  expect(await storedFileIds(orm)).toEqual([fileId]);
});

test("replaces a changed Slack photo and deletes its old file", async ({ orm, seed }) => {
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
  const readSlackPhoto = vi.fn(() => Promise.resolve(JPEG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader([member]), readSlackPhoto } });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({});
  const fileId = employees.edges[0]!.node.photoFileId;
  expect(fileId).toEqual(expect.any(String));
  expect(fileId).not.toBe(oldFileId);
  expect(await storedFileIds(orm)).toEqual([fileId]);
  const stored = await readFile(orm, fileId!);
  expect(stored?.mimeType).toBe("image/webp");
  expect(await sharp(stored!.content).metadata()).toMatchObject({ format: "webp" });
  expect(readSlackPhoto).toHaveBeenCalledExactlyOnceWith(OWNER, new URL(photoUrl));
});

test("Approve keeps the stored photo while Refresh downloads its replacement", async ({
  orm,
  seed,
}) => {
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
    slack: {
      ...slackPhotoReader([member]),
      readSlackPhoto: () => {
        downloadStarted.resolve();
        return download.promise;
      },
    },
  });

  const refresh = imports.readSlack(SETUP_HOLDER);
  try {
    await downloadStarted.promise;
    await imports.approveImport(SETUP_HOLDER);
  } finally {
    download.resolve(JPEG);
    await refresh;
  }

  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, {});
  expect(employees.edges.map(({ node }) => node.avatarFileId)).toEqual([oldFileId]);
  expect(await storedFileIds(orm)).toEqual([oldFileId]);
});

test("downloads every new photo during the read", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, {
    slack: { ...slackPhotoReader(photoMembers(60)), readSlackPhoto },
    clock: () => new Date("2026-10-20T12:00:00Z"),
  });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({ first: 100 });
  expect(employees.edges).toHaveLength(60);
  expect(employees.edges.filter(({ node }) => node.photoFileId !== null)).toHaveLength(60);
  expect(readSlackPhoto).toHaveBeenCalledTimes(60);
  expect(await storedFileIds(orm)).toHaveLength(60);
  expect(imports.sentJobs).toEqual([]);
});

test("stops starting downloads after 20 seconds and leaves the rest with initials", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const startedAt = new Date("2026-10-20T12:00:00Z");
  const imports = importUseCases(orm, {
    slack: { ...slackPhotoReader(photoMembers(40)), readSlackPhoto },
    clock: () =>
      new Date(startedAt.getTime() + (readSlackPhoto.mock.calls.length === 0 ? 0 : 21_000)),
  });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({ first: 100 });
  expect(employees.edges).toHaveLength(40);
  expect(employees.edges.filter(({ node }) => node.photoFileId !== null)).toHaveLength(16);
  expect(employees.edges.filter(({ node }) => node.photoFileId === null)).toHaveLength(24);
  expect(readSlackPhoto).toHaveBeenCalledTimes(16);
  expect(await storedFileIds(orm)).toHaveLength(16);
  expect(imports.sentJobs).toEqual([]);
});

test("imports members without photos when reading Slack members uses the time budget", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  let now = new Date("2026-10-20T12:00:00Z");
  const slack = slackPhotoReader();
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, {
    clock: () => now,
    slack: {
      ...slack,
      readSlackMembers: () => {
        now = new Date(now.getTime() + 21_000);
        return slack.readSlackMembers();
      },
      readSlackPhoto,
    },
  });

  await imports.readSlack(OWNER);

  const employees = (await imports.reads.readReview(OWNER)).listEmployees({});
  expect(employees.edges.map(({ node }) => node)).toMatchObject([
    { values: { email: { value: SLACK_MEMBER_WITH_PHOTO.profile.email } }, photoFileId: null },
  ]);
  expect(readSlackPhoto).not.toHaveBeenCalled();
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});

test("a later Refresh downloads the photos still missing", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const slack = { ...slackPhotoReader(photoMembers(40)), readSlackPhoto };
  const startedAt = new Date("2026-10-20T12:00:00Z");
  const imports = importUseCases(orm, {
    slack,
    clock: () =>
      new Date(startedAt.getTime() + (readSlackPhoto.mock.calls.length === 0 ? 0 : 21_000)),
  });
  await imports.readSlack(OWNER);
  const firstFiles = await storedFileIds(orm);
  expect(firstFiles).toHaveLength(16);
  readSlackPhoto.mockClear();
  const refresh = importUseCases(orm, {
    slack,
    clock: () => new Date("2026-10-20T12:01:00Z"),
  });

  await refresh.readSlack(OWNER);

  const employees = (await refresh.reads.readReview(OWNER)).listEmployees({ first: 100 });
  const files = await storedFileIds(orm);
  expect(employees.edges).toHaveLength(40);
  expect(employees.edges.filter(({ node }) => node.photoFileId !== null)).toHaveLength(40);
  expect(readSlackPhoto).toHaveBeenCalledTimes(24);
  expect(files).toHaveLength(40);
  expect(files).toEqual(expect.arrayContaining(firstFiles));
  expect(imports.sentJobs).toEqual([]);
  expect(refresh.sentJobs).toEqual([]);
});

test("a Slack read after Approve writes nothing", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm, { slack: slackPhotoReader() });
  await imports.approveImport(SETUP_HOLDER);
  expect(await readSetupStep(orm)).toBe("owner");

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
