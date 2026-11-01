import { expect, it } from "vitest";

import { parseSetupInviteSearch } from "./setupInviteSearch";

it("keeps the chosen audience and person", () => {
  expect(parseSetupInviteSearch({ audience: "EVERYONE", me: "a@example.com" })).toEqual({
    audience: "EVERYONE",
    me: "a@example.com",
  });
});

it.each(["unknown", undefined])("defaults audience %s to only admins", (audience) => {
  expect(parseSetupInviteSearch({ audience, me: "a@example.com" })).toEqual({
    audience: "ONLY_ADMINS",
    me: "a@example.com",
  });
});

it.each([undefined, ""])("treats person %s as not answered yet", (me) => {
  expect(parseSetupInviteSearch({ audience: "EVERYONE", me })).toEqual({
    audience: "EVERYONE",
    me: undefined,
  });
});

it("keeps an explicit answer that the owner is not in the list", () => {
  expect(parseSetupInviteSearch({ audience: "EVERYONE", me: null })).toEqual({
    audience: "EVERYONE",
    me: null,
  });
});
