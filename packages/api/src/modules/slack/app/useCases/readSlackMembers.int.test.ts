import sharp from "sharp";
import { vi } from "vitest";

import {
  expect,
  fakeSlackApi,
  JPEG,
  OWNER,
  PNG,
  SLACK_MEMBER_WITH_PHOTO,
  SLACK_PHOTO_URL,
  slackUseCases,
  test,
} from "#test/support";

import { createSecretBox } from "../../../../core/secrets";

test("refuses to read members before Slack is connected", async ({ orm }) => {
  await expect(
    slackUseCases(orm).readSlackMembers(OWNER, { knownPhotos: new Map() }),
  ).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Slack is not connected.",
  });
});

test("returns only the workspace's people", async ({ orm, seed }) => {
  await seed.slackConnection();
  const members = [
    { id: "U1", profile: { email: "avery@example.com" } },
    { id: "U2", deleted: true, profile: { email: "deleted@example.com" } },
    { id: "U3", is_bot: true, profile: { email: "bot@example.com" } },
    { id: "U4", is_app_user: true, profile: { email: "app@example.com" } },
    { id: "U5", is_restricted: true, profile: { email: "guest@example.com" } },
    { id: "U6", is_ultra_restricted: true, profile: { email: "guest2@example.com" } },
    { id: "U7" },
  ];
  const slack = slackUseCases(orm, {
    slackApi: {
      listMembers: (token) => {
        expect(token).toBe("test-slack-token");
        return Promise.resolve(members);
      },
    },
  });

  const result = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(result.workspace).toEqual({ id: "T1", name: "Acme Workspace" });
  expect(result.members).toEqual([
    { ...members[0], photo: null },
    { id: "U7", photo: null },
  ]);
});

test("reports a failed Slack read as unavailable", async ({ orm, seed }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { listMembers: () => Promise.reject(new Error("Slack unavailable")) },
  });

  await expect(slack.readSlackMembers(OWNER, { knownPhotos: new Map() })).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });
});

test("reports a token that cannot be decrypted as unavailable", async ({ orm, seed }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    secretBox: createSecretBox(Buffer.alloc(32, 7).toString("base64url")),
    slackApi: { listMembers: () => Promise.resolve([]) },
  });

  await expect(slack.readSlackMembers(OWNER, { knownPhotos: new Map() })).rejects.toMatchObject({
    code: "UNAVAILABLE",
    message: "Could not read Slack.",
  });
});

test("downloads a custom photo and fits it inside 256 by 256 as WebP", async ({ orm, seed }) => {
  await seed.slackConnection();
  const bytes = await sharp({ create: { width: 512, height: 384, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const readPhoto = vi.fn(() => Promise.resolve(bytes));
  const slack = slackUseCases(orm, { slackApi: { ...fakeSlackApi(), readPhoto } });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members[0]?.photo).toMatchObject({
    url: SLACK_PHOTO_URL,
    image: { mimeType: "image/webp" },
  });
  expect(await sharp(members[0]!.photo!.image!.bytes).metadata()).toMatchObject({
    format: "webp",
    width: 256,
    height: 192,
  });
  expect(readPhoto).toHaveBeenCalledExactlyOnceWith(new URL(SLACK_PHOTO_URL));
});

test.for([
  { name: "Slack's placeholder", profile: { is_custom_image: false } },
  {
    name: "a link on another host",
    profile: { image_192: "https://avatars.slack-edge.com.example.com/photo.jpg" },
  },
  {
    name: "a link with user info",
    profile: { image_192: "https://user:secret@avatars.slack-edge.com/photo.jpg" },
  },
  { name: "an HTTP link", profile: { image_192: SLACK_PHOTO_URL.replace("https:", "http:") } },
])("returns no photo for $name without downloading it", async ({ profile }, { orm, seed }) => {
  await seed.slackConnection();
  const member = {
    ...SLACK_MEMBER_WITH_PHOTO,
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, ...profile },
  };
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const slack = slackUseCases(orm, { slackApi: { ...fakeSlackApi([member]), readPhoto } });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toEqual([{ ...member, photo: null }]);
  expect(readPhoto).not.toHaveBeenCalled();
});

test("keeps the link without downloading a photo the caller already has for that member", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const slack = slackUseCases(orm, { slackApi: { ...fakeSlackApi(), readPhoto } });

  const { members } = await slack.readSlackMembers(OWNER, {
    knownPhotos: new Map([[SLACK_MEMBER_WITH_PHOTO.id, SLACK_PHOTO_URL]]),
  });

  expect(members[0]?.photo).toEqual({ url: SLACK_PHOTO_URL, image: null });
  expect(readPhoto).not.toHaveBeenCalled();
});

test("keeps a known member's image null when another member shares its photo URL", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const slack = slackUseCases(orm, {
    slackApi: {
      ...fakeSlackApi([
        { ...SLACK_MEMBER_WITH_PHOTO, id: "U1" },
        { ...SLACK_MEMBER_WITH_PHOTO, id: "U2" },
      ]),
      readPhoto,
    },
  });

  const { members } = await slack.readSlackMembers(OWNER, {
    knownPhotos: new Map([["U1", SLACK_PHOTO_URL]]),
  });

  expect(members).toMatchObject([
    { id: "U1", photo: { url: SLACK_PHOTO_URL, image: null } },
    {
      id: "U2",
      photo: {
        url: SLACK_PHOTO_URL,
        image: { mimeType: "image/webp" },
      },
    },
  ]);
  expect(readPhoto).toHaveBeenCalledExactlyOnceWith(new URL(SLACK_PHOTO_URL));
});

test("keeps each entry's own photo when a member ID appears twice with different photo URLs", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const secondPhotoUrl = "https://avatars.slack-edge.com/second-photo.jpg";
  const pngImage = await sharp(PNG).webp().toBuffer();
  const jpegImage = await sharp(JPEG).webp().toBuffer();
  expect(pngImage).not.toEqual(jpegImage);
  const slack = slackUseCases(orm, {
    slackApi: {
      ...fakeSlackApi([
        SLACK_MEMBER_WITH_PHOTO,
        {
          ...SLACK_MEMBER_WITH_PHOTO,
          profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, image_192: secondPhotoUrl },
        },
      ]),
      readPhoto: (url) => Promise.resolve(url.href === SLACK_PHOTO_URL ? PNG : JPEG),
    },
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toMatchObject([
    {
      id: "U1",
      photo: { url: SLACK_PHOTO_URL, image: { bytes: pngImage, mimeType: "image/webp" } },
    },
    {
      id: "U1",
      photo: { url: secondPhotoUrl, image: { bytes: jpegImage, mimeType: "image/webp" } },
    },
  ]);
});

test("a failed photo download leaves the image null and the read succeeds", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { ...fakeSlackApi(), readPhoto: () => Promise.reject(new Error("Download failed")) },
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toEqual([
    { ...SLACK_MEMBER_WITH_PHOTO, photo: { url: SLACK_PHOTO_URL, image: null } },
  ]);
});

test("a non-image download leaves the image null and the read succeeds", async ({ orm, seed }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { ...fakeSlackApi(), readPhoto: () => Promise.resolve(Buffer.from("not an image")) },
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toEqual([
    { ...SLACK_MEMBER_WITH_PHOTO, photo: { url: SLACK_PHOTO_URL, image: null } },
  ]);
});

test("starts no new round of downloads after 20 seconds", async ({ orm, seed }) => {
  await seed.slackConnection();
  const people = Array.from({ length: 40 }, (_, index) => ({
    ...SLACK_MEMBER_WITH_PHOTO,
    id: `U${index}`,
    profile: {
      ...SLACK_MEMBER_WITH_PHOTO.profile,
      image_192: `https://avatars.slack-edge.com/photo-${index}.png`,
    },
  }));
  let now = new Date("2026-10-20T12:00:00Z");
  const readPhoto = vi.fn(() => {
    now = new Date("2026-10-20T12:00:20Z");
    return Promise.resolve(PNG);
  });
  const slack = slackUseCases(orm, {
    slackApi: { ...fakeSlackApi(people), readPhoto },
    clock: () => now,
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toHaveLength(40);
  expect(readPhoto).toHaveBeenCalledTimes(16);
  expect(members.filter(({ photo }) => photo?.image != null)).toHaveLength(16);
  expect(members.filter(({ photo }) => photo?.image === null)).toHaveLength(24);
  expect(members.map(({ photo }) => photo?.url)).toEqual(
    people.map(({ profile }) => profile.image_192),
  );
});

test("counts the download budget from the start of the member read", async ({ orm, seed }) => {
  await seed.slackConnection();
  let now = new Date("2026-10-20T12:00:00Z");
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const slack = slackUseCases(orm, {
    clock: () => now,
    slackApi: {
      listMembers: () => {
        now = new Date("2026-10-20T12:00:21Z");
        return Promise.resolve([SLACK_MEMBER_WITH_PHOTO]);
      },
      readPhoto,
    },
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toEqual([
    { ...SLACK_MEMBER_WITH_PHOTO, photo: { url: SLACK_PHOTO_URL, image: null } },
  ]);
  expect(readPhoto).not.toHaveBeenCalled();
});

test("is current right after the read", async ({ orm, seed, transact }) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, { slackApi: { listMembers: () => Promise.resolve([]) } });
  const read = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  const current = await transact((tx) => read.isStillCurrent(tx));

  expect(current).toBe(true);
});

test("is no longer current after reconnecting the same workspace with the same token", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.slackConnection();
  const slack = slackUseCases(orm, {
    slackApi: { listMembers: () => Promise.resolve([]) },
    slackAuthorization: {
      exchange: () =>
        Promise.resolve({
          accessToken: "test-slack-token",
          scopes: ["users:read", "users:read.email"],
          team: { id: "T1", name: "Acme Workspace" },
        }),
    },
  });
  const read = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });
  const { authorizeUrl, pendingToken } = slack.beginSlackConnection(
    OWNER,
    "https://example.com/callback",
  );
  expect(
    await slack.finishSlackConnection(OWNER, {
      pendingToken,
      state: authorizeUrl.searchParams.get("state")!,
      code: "test-code",
      error: undefined,
    }),
  ).toBeNull();

  const current = await transact((tx) => read.isStillCurrent(tx));

  expect(current).toBe(false);
});
