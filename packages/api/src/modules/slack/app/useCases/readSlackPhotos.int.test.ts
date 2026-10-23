import sharp from "sharp";
import { vi } from "vitest";

import {
  captureLogs,
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

test("downloads a custom photo and fits it inside 256 by 256 as WebP", async ({ orm, seed }) => {
  await seed.slackConnection();
  const bytes = await sharp({ create: { width: 512, height: 384, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const readPhoto = vi.fn(() => Promise.resolve(bytes));
  const logs = captureLogs();
  const slack = slackUseCases(orm, {
    logger: logs.logger,
    slackApi: { ...fakeSlackApi(), readPhoto },
  });

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
  expect(logs.entries).toEqual([
    { level: 30, msg: "Downloaded a Slack photo", slackMemberId: "U1" },
  ]);
});

test.for([
  { name: "Slack's placeholder", profile: { is_custom_image: false }, reason: "no_custom_photo" },
  {
    name: "a link on another host",
    reason: "invalid_photo_url",
    profile: { image_192: "https://avatars.slack-edge.com.example.com/photo.jpg" },
  },
  {
    name: "a link with user info",
    reason: "invalid_photo_url",
    profile: { image_192: "https://user:secret@avatars.slack-edge.com/photo.jpg" },
  },
  {
    reason: "invalid_photo_url",
    name: "an HTTP link",
    profile: { image_192: SLACK_PHOTO_URL.replace("https:", "http:") },
  },
])(
  "returns no photo for $name without downloading it",
  async ({ profile, reason }, { orm, seed }) => {
    await seed.slackConnection();
    const member = {
      ...SLACK_MEMBER_WITH_PHOTO,
      profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, ...profile },
    };
    const readPhoto = vi.fn(() => Promise.resolve(PNG));
    const logs = captureLogs();
    const slack = slackUseCases(orm, {
      logger: logs.logger,
      slackApi: { ...fakeSlackApi([member]), readPhoto },
    });

    const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

    expect(members).toEqual([{ ...member, photo: null }]);
    expect(readPhoto).not.toHaveBeenCalled();
    expect(logs.entries).toEqual([
      { level: 30, msg: "Skipped a Slack photo", slackMemberId: "U1", reason },
    ]);
  },
);

test("keeps the link without downloading a photo the caller already has for that member", async ({
  orm,
  seed,
}) => {
  await seed.slackConnection();
  const readPhoto = vi.fn(() => Promise.resolve(PNG));
  const logs = captureLogs();
  const slack = slackUseCases(orm, {
    logger: logs.logger,
    slackApi: { ...fakeSlackApi(), readPhoto },
  });

  const { members } = await slack.readSlackMembers(OWNER, {
    knownPhotos: new Map([[SLACK_MEMBER_WITH_PHOTO.id, SLACK_PHOTO_URL]]),
  });

  expect(members[0]?.photo).toEqual({ url: SLACK_PHOTO_URL, image: null });
  expect(readPhoto).not.toHaveBeenCalled();
  expect(logs.entries).toEqual([
    { level: 30, msg: "Kept a stored Slack photo", slackMemberId: "U1" },
  ]);
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
  const logs = captureLogs();
  const photoUrl = `${SLACK_PHOTO_URL}?token=secret-photo-token`;
  const member = {
    ...SLACK_MEMBER_WITH_PHOTO,
    profile: { ...SLACK_MEMBER_WITH_PHOTO.profile, image_192: photoUrl },
  };
  const errorMessage = `Download failed for ${photoUrl}`;
  const slack = slackUseCases(orm, {
    logger: logs.logger,
    slackApi: {
      ...fakeSlackApi([member]),
      readPhoto: () => Promise.reject(new TypeError(errorMessage)),
    },
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toEqual([{ ...member, photo: { url: photoUrl, image: null } }]);
  expect(logs.entries).toEqual([
    {
      level: 40,
      msg: "Downloading a Slack photo failed",
      slackMemberId: "U1",
      reason: "TypeError",
    },
  ]);
  for (const privateValue of [
    photoUrl,
    "secret-photo-token",
    errorMessage,
    "Avery",
    "Stone",
    "avery@example.com",
    "test-slack-token",
  ]) {
    expect(logs.output).not.toContain(privateValue);
  }
});

test("a non-image download leaves the image null and the read succeeds", async ({ orm, seed }) => {
  await seed.slackConnection();
  const logs = captureLogs();
  const slack = slackUseCases(orm, {
    logger: logs.logger,
    slackApi: { ...fakeSlackApi(), readPhoto: () => Promise.resolve(Buffer.from("not an image")) },
  });

  const { members } = await slack.readSlackMembers(OWNER, { knownPhotos: new Map() });

  expect(members).toEqual([
    { ...SLACK_MEMBER_WITH_PHOTO, photo: { url: SLACK_PHOTO_URL, image: null } },
  ]);
  expect(logs.entries).toEqual([
    { level: 40, msg: "A Slack photo is not an image", slackMemberId: "U1" },
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
  const logs = captureLogs();
  const slack = slackUseCases(orm, {
    logger: logs.logger,
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
  expect(logs.entries.filter(({ msg }) => msg === "Deferred a Slack photo")).toEqual(
    people.slice(16).map(({ id }) => ({
      level: 30,
      msg: "Deferred a Slack photo",
      slackMemberId: id,
      reason: "download_budget_exhausted",
    })),
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
