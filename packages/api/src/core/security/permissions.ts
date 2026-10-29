import { invalidInput } from "../applicationError";

/** A named list of grants and operations; a user has the default one and any number of others. */
export type PermissionProfile = "EMPLOYEE" | "ADMIN" | "OWNER";

/** The default profile: every user has it; it is never stored and never removed. */
export const DEFAULT_PROFILE = "EMPLOYEE";

/** The kinds of record permissions apply to; tests add their own by declaration merging. */
export interface PermissionObjects {
  employee: true;
}

/** A kind of record permissions apply to. */
export type PermissionObject = keyof PermissionObjects;

/** What can be done to one record of an object. */
export type RecordAction = "create" | "read" | "update" | "delete";

/**
 * Which records a grant reaches, by their subject, relative to the caller's employee: the caller,
 * people they manage directly, everyone below them in the reporting line, everyone above them in
 * it, or everyone. Neither report scope includes the caller.
 */
export type Scope = "self" | "direct_reports" | "all_reports" | "managers" | "all";

/**
 * Whom a record is about: the id of its subject, an employee today, or "public" for a record about
 * nobody, which every read grant on its object reaches and only grants on `all` write.
 */
export type Subject = string;

/**
 * The records a caller's grants reach for one action: none, all, or the subjects reached, with
 * "public" among them when public records are.
 */
export type RecordScope = "none" | "all" | readonly Subject[];

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
 * by sharing the definition in code, not by a link between profiles: stored edits to the Admin profile will not reach the owner.
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

/** A user's profiles in their shown order: the default, the stored ones, then `OWNER` for the owner. */
export function profilesOf(
  stored: readonly PermissionProfile[],
  isOwner: boolean,
): PermissionProfile[] {
  const order = Object.keys(PERMISSION_PROFILES) as PermissionProfile[];
  const held = new Set<PermissionProfile>([
    DEFAULT_PROFILE,
    ...stored,
    ...(isOwner ? ["OWNER" as const] : []),
  ]);
  return order.filter((profile) => held.has(profile));
}

/** The profiles to store from the ones an admin sent: each once, without the default; refuses `OWNER`. */
export function parseGivenProfiles(profiles: readonly PermissionProfile[]) {
  if (profiles.includes("OWNER")) {
    throw invalidInput([{ field: "profiles", code: "not_assignable" }]);
  }
  return [
    ...new Set(
      profiles.filter(
        (profile): profile is Exclude<PermissionProfile, "EMPLOYEE" | "OWNER"> =>
          profile !== DEFAULT_PROFILE,
      ),
    ),
  ];
}
