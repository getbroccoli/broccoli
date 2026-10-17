import { expect, it } from "vitest";

import { PrincipalSecurityContext, requireSignedIn } from ".";

it("refuses a missing security context with UNAUTHENTICATED", () => {
  expect(() => requireSignedIn(null)).toThrowError(
    expect.objectContaining({
      code: "UNAUTHENTICATED",
      message: "Sign in to continue.",
      fieldErrors: [],
    }),
  );
});

it("allows the owner", () => {
  const ctx = PrincipalSecurityContext.user({
    userId: "owner-1",
    email: "owner@example.com",
    isOwner: true,
  });

  expect(() => ctx.requireOwnerOrSystem()).not.toThrow();
});

it("allows the system", () => {
  const ctx = PrincipalSecurityContext.system();

  expect(() => ctx.requireOwnerOrSystem()).not.toThrow();
});

it("refuses a signed-in non-owner with FORBIDDEN", () => {
  const ctx = PrincipalSecurityContext.user({
    userId: "user-1",
    email: "user@example.com",
    isOwner: false,
  });

  expect(() => ctx.requireOwnerOrSystem()).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
      fieldErrors: [],
    }),
  );
});

it("distinguishes the system from a signed-in user", () => {
  const system = PrincipalSecurityContext.system();
  const user = { userId: "user-1", email: "user@example.com", isOwner: false };
  const signedIn = PrincipalSecurityContext.user(user);

  expect(system.user).toBeNull();
  expect(system.isSystem).toBe(true);
  expect(signedIn.user).toEqual(user);
  expect(signedIn.isSystem).toBe(false);
});

it("allows the setup holder to access setup without a user or system privileges", () => {
  const ctx = PrincipalSecurityContext.setupHolder();

  expect(() => ctx.requireSetupAccess()).not.toThrow();
  expect(ctx.user).toBeNull();
  expect(ctx.isSystem).toBe(false);
  expect(ctx.isSetupHolder).toBe(true);
});

it("refuses the setup holder access reserved for the owner or system", () => {
  const ctx = PrincipalSecurityContext.setupHolder();

  expect(() => ctx.requireOwnerOrSystem()).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
    }),
  );
});

it("refuses a non-owner access to setup", () => {
  const ctx = PrincipalSecurityContext.user({
    userId: "user-1",
    email: "user@example.com",
    isOwner: false,
  });

  expect(() => ctx.requireSetupAccess()).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message: "Only the owner can do this.",
    }),
  );
});
