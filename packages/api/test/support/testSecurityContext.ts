import { PrincipalSecurityContext, type EmployeeDirectory } from "../../src/core/security";

const nobody: EmployeeDirectory = {
  employeeIdOfUser: () => Promise.resolve(null),
  managersAbove: () => Promise.resolve(new Map()),
  reportsBelow: () => Promise.resolve([]),
  ownersEmployeeId: () => Promise.resolve(null),
};

export const OWNER = PrincipalSecurityContext.user(
  {
    userId: "test-owner",
    email: "owner@example.com",
    isOwner: true,
    permissionProfiles: ["EMPLOYEE", "OWNER"],
    employeeId: null,
  },
  nobody,
);

export const ADMIN = PrincipalSecurityContext.user(
  {
    userId: "test-admin",
    email: "admin@example.com",
    isOwner: false,
    permissionProfiles: ["EMPLOYEE", "ADMIN"],
    employeeId: null,
  },
  nobody,
);

export const EMPLOYEE = PrincipalSecurityContext.user(
  {
    userId: "test-user",
    email: "user@example.com",
    isOwner: false,
    permissionProfiles: ["EMPLOYEE"],
    employeeId: null,
  },
  nobody,
);

export const SYSTEM = PrincipalSecurityContext.system();
export const SETUP_HOLDER = PrincipalSecurityContext.setupHolder();
export const SETUP_EXTERNAL_AGENT =
  PrincipalSecurityContext.setupExternalAgent("test-agent-session");
