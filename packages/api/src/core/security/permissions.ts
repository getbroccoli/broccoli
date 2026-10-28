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
  /** Stable and unique per profile chain, so stored changes can name a built-in grant. */
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
  /** Parents whose grants and operations this profile adds to its own. */
  extends?: readonly string[];
  grants: readonly Grant[];
  operations: readonly Operation[];
}

/** A profile with everything it inherits. */
export interface EffectiveProfile {
  grants: readonly Grant[];
  operations: ReadonlySet<Operation>;
}

const PROFILE_DEFINITIONS: Record<PermissionProfile, ProfileDefinition> = {
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
  ADMIN: {
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
  },
  OWNER: { builtIn: true, extends: ["ADMIN"], grants: [], operations: ["RESET_WORKSPACE"] },
};

/**
 * Each profile with its parents' grants and operations added, followed to the roots; a profile
 * reached twice adds its grants once. Throws on a cycle or an unknown parent.
 */
export function flattenProfiles<Name extends string>(
  definitions: Record<Name, ProfileDefinition>,
): Record<Name, EffectiveProfile> {
  const byName = new Map<string, ProfileDefinition>(Object.entries(definitions));
  const flatten = (name: string): EffectiveProfile => {
    const reached = new Set<string>();
    const visit = (current: string, path: readonly string[]) => {
      if (path.includes(current)) {
        throw new Error(
          `Permission profiles extend each other in a cycle: ${[...path, current].join(" → ")}.`,
        );
      }
      if (reached.has(current)) return;
      reached.add(current);
      for (const parent of byName.get(current)!.extends ?? []) {
        if (!byName.has(parent)) {
          throw new Error(`Permission profile "${current}" extends unknown "${parent}".`);
        }
        visit(parent, [...path, current]);
      }
    };
    visit(name, []);
    const profiles = [...reached].map((reachedName) => byName.get(reachedName)!);
    return {
      grants: profiles.flatMap(({ grants }) => grants),
      operations: new Set(profiles.flatMap(({ operations }) => operations)),
    };
  };
  return Object.fromEntries([...byName.keys()].map((name) => [name, flatten(name)])) as Record<
    Name,
    EffectiveProfile
  >;
}

/** The built-in profiles, flattened once when the code loads. */
export const PERMISSION_PROFILES = flattenProfiles(PROFILE_DEFINITIONS);

/** A user's profiles in their shown order: the base, the stored extras, then `OWNER` for the owner. */
export function profilesOf(
  extras: readonly PermissionProfile[],
  isOwner: boolean,
): PermissionProfile[] {
  const order = Object.keys(PROFILE_DEFINITIONS) as PermissionProfile[];
  const held = new Set<PermissionProfile>([
    BASE_PROFILE,
    ...extras,
    ...(isOwner ? ["OWNER" as const] : []),
  ]);
  return order.filter((profile) => held.has(profile));
}
