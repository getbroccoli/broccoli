import { expect, it } from "vitest";

import { ADMIN, EMPLOYEE, OWNER, SETUP_EXTERNAL_AGENT, SETUP_HOLDER, SYSTEM } from "#test/support";

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

it.each([
  ["owner", "MANAGE_WORKSPACE", OWNER],
  ["owner", "RESET_WORKSPACE", OWNER],
  ["admin", "MANAGE_WORKSPACE", ADMIN],
  ["system", "MANAGE_WORKSPACE", SYSTEM],
  ["system", "RESET_WORKSPACE", SYSTEM],
] as const)("allows %s operation %s", (_name, operation, ctx) => {
  expect(ctx.can(operation)).toBe(true);
  expect(() => ctx.require(operation)).not.toThrow();
});

it.each([
  ["admin", "RESET_WORKSPACE", ADMIN, "Only the owner can do this."],
  ["employee", "RESET_WORKSPACE", EMPLOYEE, "Only the owner can do this."],
  ["employee", "MANAGE_WORKSPACE", EMPLOYEE, "Only admins can do this."],
  ["setup holder", "MANAGE_WORKSPACE", SETUP_HOLDER, "Only admins can do this."],
  ["setup holder", "RESET_WORKSPACE", SETUP_HOLDER, "Only the owner can do this."],
  ["agent", "MANAGE_WORKSPACE", SETUP_EXTERNAL_AGENT, "Only admins can do this."],
  ["agent", "RESET_WORKSPACE", SETUP_EXTERNAL_AGENT, "Only the owner can do this."],
] as const)("refuses the %s operation %s", (_name, operation, ctx, message) => {
  expect(ctx.can(operation)).toBe(false);
  expect(() => ctx.require(operation)).toThrowError(
    expect.objectContaining({
      code: "FORBIDDEN",
      message,
      fieldErrors: [],
    }),
  );
});

it("allows Broccoli's own work", () => {
  expect(() => SYSTEM.requireSystem()).not.toThrow();
});

it.each([OWNER, ADMIN, EMPLOYEE, SETUP_HOLDER, SETUP_EXTERNAL_AGENT])(
  "refuses system access to any other caller",
  (ctx) => {
    expect(() => ctx.requireSystem()).toThrowError(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: "Only Broccoli can do this.",
      }),
    );
  },
);

it.each(["MANAGE_WORKSPACE", "RESET_WORKSPACE"] as const)(
  "allows the setup holder to access setup for %s",
  (operation) => {
    expect(() => SETUP_HOLDER.requireSetupAccess(operation)).not.toThrow();
    expect(SETUP_HOLDER.user).toBeNull();
    expect(SETUP_HOLDER.isSystem).toBe(false);
    expect(SETUP_HOLDER.isSetupHolder).toBe(true);
  },
);

it("refuses an employee access to setup", () => {
  expect(() => EMPLOYEE.requireSetupAccess("MANAGE_WORKSPACE")).toThrowError(
    expect.objectContaining({ code: "FORBIDDEN", message: "Only admins can do this." }),
  );
});

it("allows an admin to manage setup", () => {
  expect(() => ADMIN.requireSetupAccess("MANAGE_WORKSPACE")).not.toThrow();
});

it("refuses an admin resetting setup", () => {
  expect(() => ADMIN.requireSetupAccess("RESET_WORKSPACE")).toThrowError(
    expect.objectContaining({ code: "FORBIDDEN", message: "Only the owner can do this." }),
  );
});

it.each(["create", "read", "update", "delete"] as const)(
  "allows the system to %s every employee",
  (action) => {
    expect(() => SYSTEM.requireEveryRecord("employee", action)).not.toThrow();
  },
);

it("allows an employee to read every employee", () => {
  expect(() => EMPLOYEE.requireEveryRecord("employee", "read")).not.toThrow();
});

it("refuses an employee creating employees", () => {
  expect(() => EMPLOYEE.requireEveryRecord("employee", "create")).toThrowError(
    expect.objectContaining({ code: "FORBIDDEN", message: "You are not allowed to do this." }),
  );
});

it("distinguishes the system from a signed-in user", () => {
  expect(SYSTEM.user).toBeNull();
  expect(SYSTEM.isSystem).toBe(true);
  expect(EMPLOYEE.user).toMatchObject({ permissionProfile: "EMPLOYEE", employeeId: null });
  expect(EMPLOYEE.isSystem).toBe(false);
});

it("identifies a setup agent by its session without system privileges", () => {
  const ctx = PrincipalSecurityContext.setupExternalAgent("agent-session");

  expect(ctx.requireSetupExternalAgent()).toBe("agent-session");
  expect(ctx.externalAgentSessionId).toBe("agent-session");
  expect(ctx.user).toBeNull();
  expect(ctx.isSystem).toBe(false);
  expect(ctx.isSetupHolder).toBe(false);
});

it("refuses setup access to the agent", () => {
  expect(() => SETUP_EXTERNAL_AGENT.requireSetupAccess("MANAGE_WORKSPACE")).toThrowError(
    expect.objectContaining({ code: "FORBIDDEN", message: "Only admins can do this." }),
  );
});

it.each([SYSTEM, SETUP_HOLDER, OWNER, ADMIN, EMPLOYEE])(
  "refuses agent access to a caller without an agent session",
  (ctx) => {
    expect(() => ctx.requireSetupExternalAgent()).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN", message: "Only your agent can do this." }),
    );
  },
);
