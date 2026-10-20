import { expect, it } from "vitest";

import { SLACK_MEMBER_WITH_PHOTO, SLACK_PHOTO_URL } from "#test/support";

import { mapSlackMembers } from "./mapSlackMembers";

it("maps profile names, normalises the email and leaves the start date unknown", () => {
  const records = mapSlackMembers([
    {
      id: "U1",
      photo: null,
      profile: {
        first_name: "Avery",
        last_name: "Stone",
        real_name: "Ignored Name",
        email: "  Avery@EXAMPLE.COM  ",
        title: "Designer",
      },
    },
  ]);

  expect(records).toMatchObject([
    {
      externalId: "U1",
      values: {
        firstName: "Avery",
        lastName: "Stone",
        email: "avery@example.com",
        jobTitle: "Designer",
        startDate: null,
      },
    },
  ]);
});

it.each([undefined, "", "   ", "not-an-email"])("skips the invalid email %s", (email) => {
  expect(mapSlackMembers([{ id: "U1", photo: null, profile: { email } }])).toEqual([]);
});

it("keeps each Slack user id once", () => {
  const member = { id: "U1", photo: null, profile: { email: "avery@example.com" } };

  const records = mapSlackMembers([member, member]);

  expect(records.map((record) => record.externalId)).toEqual(["U1"]);
});

it.each([
  { first_name: " ", last_name: "Stone" },
  { first_name: "Avery", last_name: " " },
])("splits the profile real name when either name is blank: %j", (names) => {
  const [record] = mapSlackMembers([
    {
      id: "U1",
      photo: null,
      name: "Ignored Username",
      real_name: "Ignored Name",
      profile: { ...names, real_name: "Avery Robin Stone", email: "avery@example.com" },
    },
  ]);

  expect(record?.values).toMatchObject({ firstName: "Avery Robin", lastName: "Stone" });
});

it("falls back to the member real name when the profile real name is blank", () => {
  const [record] = mapSlackMembers([
    {
      id: "U1",
      photo: null,
      name: "Ignored Username",
      real_name: "Avery Stone",
      profile: { real_name: " ", email: "avery@example.com" },
    },
  ]);

  expect(record?.values).toMatchObject({ firstName: "Avery", lastName: "Stone" });
});

it("falls back to the username when both real names are blank", () => {
  const [record] = mapSlackMembers([
    {
      id: "U1",
      photo: null,
      name: "Avery Stone",
      real_name: " ",
      profile: { real_name: " ", email: "avery@example.com" },
    },
  ]);

  expect(record?.values).toMatchObject({ firstName: "Avery", lastName: "Stone" });
});

it("uses a single word fallback as the first name only", () => {
  const [record] = mapSlackMembers([
    { id: "U1", photo: null, name: "Avery", profile: { email: "avery@example.com" } },
  ]);

  expect(record?.values).toMatchObject({ firstName: "Avery", lastName: null });
});

it("keeps a member without any name", () => {
  const [record] = mapSlackMembers([
    { id: "U1", photo: null, profile: { email: "avery@example.com" } },
  ]);

  expect(record?.values).toMatchObject({ firstName: null, lastName: null });
});

it.each([undefined, "", "   "])("turns the blank job title %s into null", (title) => {
  const [record] = mapSlackMembers([
    { id: "U1", photo: null, profile: { email: "avery@example.com", title } },
  ]);

  expect(record?.values.jobTitle).toBeNull();
});

it("retains only the specified Slack fields in the raw record", () => {
  const raw = {
    id: "U1",
    name: "avery",
    real_name: "Avery Stone",
    profile: {
      first_name: "Avery",
      last_name: "Stone",
      real_name: "Avery Stone",
      display_name: "Avery",
      email: "avery@example.com",
      title: "Designer",
      image_192: SLACK_PHOTO_URL,
      is_custom_image: true,
    },
  };
  const member = {
    ...raw,
    photo: null,
    tz: "Europe/Berlin",
    is_admin: true,
    profile: { ...raw.profile, phone: "private", image_512: "https://example.com/avatar.png" },
  };

  const [record] = mapSlackMembers([member]);

  expect(record?.raw).toEqual(raw);
});

it("takes the photo link from the member's photo", () => {
  const [record] = mapSlackMembers([
    {
      ...SLACK_MEMBER_WITH_PHOTO,
      photo: { url: "https://avatars.slack-edge.com/current.jpg", image: null },
    },
  ]);

  expect(record?.photoUrl).toBe("https://avatars.slack-edge.com/current.jpg");
});
