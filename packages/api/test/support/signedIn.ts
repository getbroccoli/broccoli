import type { Orm } from "../../src/core/db";
import { PrincipalSecurityContext, type PermissionProfile } from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";

export function signedIn(
  orm: Orm,
  {
    profiles,
    employeeId,
  }: {
    profiles: readonly PermissionProfile[];
    employeeId: string | null;
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
  );
}
