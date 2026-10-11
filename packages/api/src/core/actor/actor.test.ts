import { expect, it } from "vitest";

import { requireOwner } from ".";

it("refuses a missing actor with UNAUTHENTICATED", () => {
  expect(() => requireOwner(null)).toThrowError(
    expect.objectContaining({
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
      fieldErrors: [],
    }),
  );
});

it("refuses a signed-in non-owner with FORBIDDEN", () => {
  const actor = { userId: "user-1", isOwner: false };

  expect(() => requireOwner(actor)).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    }),
  );
});

it("returns the owner", () => {
  const actor = { userId: "owner-1", isOwner: true };

  expect(requireOwner(actor)).toBe(actor);
});
