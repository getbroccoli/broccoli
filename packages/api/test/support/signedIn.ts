import type { Orm } from "../../src/core/db";
import { PrincipalSecurityContext, type PermissionProfile } from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";

export function signedIn(
  orm: Orm,
  {
    profile,
    employeeId,
  }: {
    profile: PermissionProfile;
    employeeId: string | null;
  },
) {
  return PrincipalSecurityContext.user(
    {
      userId: `test-${employeeId ?? profile}`,
      email: "user@example.com",
      isOwner: profile === "OWNER",
      permissionProfile: profile,
      employeeId,
    },
    employeeDirectory(orm),
  );
}
