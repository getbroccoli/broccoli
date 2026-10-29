import type { Orm } from "../../src/core/db";
import {
  PERMISSION_PROFILES,
  PrincipalSecurityContext,
  type Grant,
  type PermissionProfile,
} from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";

export function signedIn(
  orm: Orm,
  {
    profiles,
    employeeId,
    grants,
  }: {
    profiles: readonly PermissionProfile[];
    employeeId: string | null;
    grants?: readonly Grant[];
  },
) {
  return PrincipalSecurityContext.user(
    {
      userId: `test-${employeeId ?? profiles.join("-")}`,
      email: "user@example.com",
      isOwner: profiles.includes("OWNER"),
      permissionProfiles: profiles,
      employeeId,
    },
    employeeDirectory(orm),
    grants === undefined
      ? undefined
      : { ...PERMISSION_PROFILES, EMPLOYEE: { builtIn: true, grants, operations: [] } },
  );
}
