import { expect, it } from "vitest";

import { requireOwner, requireSignedIn } from ".";

it("refuses a missing actor with UNAUTHENTICATED", () => {
  expect(() => requireSignedIn(null)).toThrowError(
    expect.objectContaining({
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
      fieldErrors: [],
    }),
  );
});

it("refuses a signed-in non-owner with FORBIDDEN", () => {
  const actor = { userId: "user-1", email: "user@example.com", isOwner: false };

  expect(() => requireOwner(actor)).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    }),
  );
});

it("returns the owner", () => {
  const actor = { userId: "owner-1", email: "owner@example.com", isOwner: true };

  expect(requireOwner(actor)).toBe(actor);
});

it("returns a signed-in actor", () => {
  const actor = { userId: "user-1", email: "user@example.com", isOwner: false };

  expect(requireSignedIn(actor)).toBe(actor);
});
