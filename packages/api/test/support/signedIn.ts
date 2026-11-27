import assert from "node:assert/strict";

import type { Orm } from "../../src/core/db";
import {
  PERMISSION_PROFILES,
  PrincipalSecurityContext,
  type Grant,
  type PermissionProfile,
  type SecurityContext,
} from "../../src/core/security";
import { employeeDirectory } from "../../src/modules/employees";

/**
 * A signed-in user linked to `employeeId`: holding the built-in `profiles`, or only `grants`, as a
 * profile no release ships, such as one that reads just the caller's reports.
 */
export function signedIn(
  orm: Orm,
  options: {
    employeeId: string | null;
    agentConnection?: { id: string; scopes: readonly string[] };
  } & ({ profiles: readonly PermissionProfile[] } | { grants: readonly Grant[] }),
) {
  const profiles = "profiles" in options ? options.profiles : (["EMPLOYEE"] as const);
  return PrincipalSecurityContext.user(
    {
      userId: `test-${options.employeeId ?? profiles.join("-")}`,
      email: "user@example.com",
      isOwner: profiles.includes("OWNER"),
      permissionProfiles: profiles,
      employeeId: options.employeeId,
    },
    employeeDirectory(orm),
    {
      profiles:
        "grants" in options
          ? {
              ...PERMISSION_PROFILES,
              EMPLOYEE: { builtIn: true, grants: options.grants, operations: [] },
            }
          : undefined,
      agentConnection: options.agentConnection && {
        id: options.agentConnection.id,
        scopes: new Set(options.agentConnection.scopes),
      },
    },
  );
}

/** A signed-in actor using another employee's profiles. */
export function actingAs(
  orm: Orm,
  {
    actor,
    employeeId,
    profiles = ["EMPLOYEE"],
  }: {
    actor: SecurityContext;
    employeeId: string;
    profiles?: readonly PermissionProfile[];
  },
) {
  assert(actor.user);
  return PrincipalSecurityContext.user(
    { ...actor.user, employeeId, permissionProfiles: profiles, isOwner: false },
    employeeDirectory(orm),
    { actor: actor.user },
  );
}
