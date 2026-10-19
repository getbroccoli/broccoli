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
import { instanceRepository, readSetupStep } from "../../../../core/instance";

test.for([
  { content: PNG, mimeType: "image/png" },
  { content: JPEG, mimeType: "image/jpeg" },
  { content: WEBP, mimeType: "image/webp" },
])("stores a member's $mimeType photo", async (photo, { orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const readSlackPhoto = vi.fn(() => Promise.resolve(photo.content));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader(), readSlackPhoto } });

  await imports.readSlack(OWNER);

  const employees = await imports.reads.listEmployees(OWNER, {});
  const [fileId] = await storedFileIds(orm);
  expect(fileId).toEqual(expect.any(String));
  expect(employees.edges.map(({ node }) => node.photoFileId)).toEqual([fileId]);
  expect(await readFile(orm, fileId!)).toEqual(photo);
  expect(readSlackPhoto).toHaveBeenCalledWith(OWNER, new URL(SLACK_PHOTO_URL));
});

test("does not download a generated Slack placeholder", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const member = {
    ...SLACK_MEMBER_WITH_PHOTO,
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, is_custom_image: false },
  };
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader([member]), readSlackPhoto } });

  await imports.readSlack(OWNER);

  expect(readSlackPhoto).not.toHaveBeenCalled();
  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node.photoFileId),
  ).toEqual([null]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("a failed photo download leaves initials and the Slack read succeeds", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm, {
    slack: {
      ...slackPhotoReader(),
      readSlackPhoto: () => Promise.reject(new Error("Download failed")),
    },
  });

  await imports.readSlack(OWNER);

  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node.photoFileId),
  ).toEqual([null]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("a non-image download leaves initials", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm, {
    slack: {
      ...slackPhotoReader(),
      readSlackPhoto: () => Promise.resolve(Buffer.from("not an image")),
    },
  });

  await imports.readSlack(OWNER);

  expect(
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node.photoFileId),
  ).toEqual([null]);
  expect(await storedFileIds(orm)).toEqual([]);
});

test("keeps a stored photo when Slack's photo link is unchanged", async ({ orm, seed }) => {
  await instanceRepository(orm).advanceStep("company", "import");
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
    (await imports.reads.listEmployees(OWNER, {})).edges.map(({ node }) => node.photoFileId),
  ).toEqual([fileId]);
  expect(await storedFileIds(orm)).toEqual([fileId]);
});

test("replaces a changed Slack photo and deletes its old file", async ({ orm, seed }) => {
  await instanceRepository(orm).advanceStep("company", "import");
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
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, image_512: photoUrl },
  };
  const readSlackPhoto = vi.fn(() => Promise.resolve(JPEG));
  const imports = importUseCases(orm, { slack: { ...slackPhotoReader([member]), readSlackPhoto } });

  await imports.readSlack(OWNER);

  const employees = await imports.reads.listEmployees(OWNER, {});
  const fileId = employees.edges[0]!.node.photoFileId;
  expect(fileId).toEqual(expect.any(String));
  expect(fileId).not.toBe(oldFileId);
  expect(await storedFileIds(orm)).toEqual([fileId]);
  expect(await readFile(orm, fileId!)).toEqual({ content: JPEG, mimeType: "image/jpeg" });
  expect(readSlackPhoto).toHaveBeenCalledExactlyOnceWith(OWNER, new URL(photoUrl));
});

test("downloads only the first 50 photos by name and queues the rest", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const members = Array.from({ length: 52 }, (_, index) => ({
    id: `U${index}`,
    profile: {
      first_name: index < 26 ? "Avery" : "Robin",
      last_name: String(index % 26).padStart(2, "0"),
      email: `employee${index}@example.com`,
      is_custom_image: true,
      image_512: `https://avatars.slack-edge.com/photo-${index}.png`,
    },
  }));
  const readSlackPhoto = vi.fn(() => Promise.resolve(PNG));
  const imports = importUseCases(orm, {
    slack: { ...slackPhotoReader(members.toReversed()), readSlackPhoto },
  });

  await imports.readSlack(OWNER);

  const employees = await imports.reads.listEmployees(OWNER, { first: 100 });
  expect(
    employees.edges
      .filter(({ node }) => node.photoFileId !== null)
      .map(({ node }) => node.values.email.value),
  ).toEqual(members.slice(0, 50).map(({ profile }) => profile.email));
  expect(employees.edges.slice(50).map(({ node }) => node.photoFileId)).toEqual([null, null]);
  expect(readSlackPhoto).toHaveBeenCalledTimes(50);
  expect(await storedFileIds(orm)).toHaveLength(50);
  const [source] = await imports.reads.listSources(OWNER);
  expect(imports.sentJobs).toEqual([
    { name: "imports.downloadSlackPhotos", payload: { sourceId: source!.id, after: null } },
  ]);
});

test("queues no photo job when every photo was downloaded", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const members = Array.from({ length: 50 }, (_, index) => ({
    ...SLACK_MEMBER_WITH_PHOTO,
    id: `U${index}`,
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, email: `employee${index}@example.com` },
  }));
  const imports = importUseCases(orm, { slack: slackPhotoReader(members) });

  await imports.readSlack(OWNER);

  expect(await storedFileIds(orm)).toHaveLength(50);
  expect(imports.sentJobs).toEqual([]);
});

test("a Slack read after Approve writes nothing", async ({ orm }) => {
  await instanceRepository(orm).advanceStep("company", "import");
  const imports = importUseCases(orm, { slack: slackPhotoReader() });
  await imports.approveImport(SETUP_HOLDER);
  expect(await readSetupStep(orm)).toBe("owner");

  await imports.readSlack(SETUP_HOLDER);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.listEmployees(SETUP_HOLDER, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});
