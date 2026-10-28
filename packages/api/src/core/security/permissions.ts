/** A named list of grants and operations; a user has the base one and any number of others. */
export type PermissionProfile = "EMPLOYEE" | "ADMIN" | "OWNER";

/** The profile every user has, never stored and never removed. */
export const BASE_PROFILE = "EMPLOYEE";

/** A kind of record permissions apply to. */
export type PermissionObject = "employee";

/** What can be done to one record of an object. */
export type RecordAction = "create" | "read" | "update" | "delete";

/**
 * Which records a grant reaches, relative to the caller's employee: the caller, people they
 * manage directly, everyone below them in the reporting line, or everyone. Neither report scope
 * includes the caller.
 */
export type Scope = "self" | "direct_reports" | "all_reports" | "all";

/** Things done outside any record. */
export const OPERATIONS = ["MANAGE_WORKSPACE", "RESET_WORKSPACE"] as const;
export type Operation = (typeof OPERATIONS)[number];

/** A list of actions on one object within one scope. */
export interface Grant {
  /** Stable and unique per profile, so stored changes can name a built-in grant. */
  key: string;
  object: PermissionObject;
  actions: readonly RecordAction[];
  scope: Scope;
  /** The fields the listed write actions may change; "*" for every ordinary editable field. */
  fields?: readonly string[] | "*";
}

export interface ProfileDefinition {
  /** Built into Broccoli: its grants live in code and change with releases. */
  builtIn: boolean;
  grants: readonly Grant[];
  operations: readonly Operation[];
}

/** The union of the profiles a user holds. */
export interface EffectiveProfile {
  grants: readonly Grant[];
  operations: ReadonlySet<Operation>;
}

const ADMIN: ProfileDefinition = {
  builtIn: true,
  grants: [
    {
      key: "employee.manage.all",
      object: "employee",
      actions: ["create", "read", "update", "delete"],
      scope: "all",
      fields: "*",
    },
  ],
  operations: ["MANAGE_WORKSPACE"],
};

/**
 * The built-in profiles. `OWNER` holds Admin's grants and operations plus resetting the workspace,
 * by sharing the definition, not by a link between profiles: edits to Admin never reach the owner.
 */
export const PERMISSION_PROFILES: Record<PermissionProfile, ProfileDefinition> = {
  EMPLOYEE: {
    builtIn: true,
    grants: [
      { key: "employee.read.all", object: "employee", actions: ["read"], scope: "all" },
      {
        key: "employee.update.self",
        object: "employee",
        actions: ["update"],
        scope: "self",
        fields: ["firstName", "lastName", "avatar"],
      },
      {
        key: "employee.update.reports",
        object: "employee",
        actions: ["update"],
        scope: "all_reports",
        fields: ["firstName", "lastName", "avatar", "jobTitle"],
      },
    ],
    operations: [],
  },
  ADMIN,
  OWNER: { ...ADMIN, operations: [...ADMIN.operations, "RESET_WORKSPACE"] },
};

/** A user's profiles in their shown order: the base, the stored extras, then `OWNER` for the owner. */
export function profilesOf(
  extras: readonly PermissionProfile[],
  isOwner: boolean,
): PermissionProfile[] {
  const order = Object.keys(PERMISSION_PROFILES) as PermissionProfile[];
  const held = new Set<PermissionProfile>([
    BASE_PROFILE,
    ...extras,
    ...(isOwner ? ["OWNER" as const] : []),
  ]);
  return order.filter((profile) => held.has(profile));
}
