import type { Auth } from "../../auth";
import type { Orm } from "../../db";
import { readAssignment, type ManagedAssignment } from "../../instance";

/** This process's Better Auth, or null while a managed instance waits for its init. */
export interface AuthSource {
  current(): Promise<Auth | null>;
}

export function fixedAuth(auth: Auth): AuthSource {
  return { current: () => Promise.resolve(auth) };
}

/**
 * Builds Better Auth from the stored assignment the first time one exists. Until then
 * every call reads the database again, so an init committed by another replica, or
 * before a restart, is picked up without polling or a restart.
 */
export function managedAuth(orm: Orm, build: (assignment: ManagedAssignment) => Auth): AuthSource {
  let auth: Auth | undefined;
  return {
    current: async () => {
      if (auth) {
        return auth;
      }
      const assignment = await readAssignment(orm);
      // Two concurrent first calls may both read the assignment; the first build wins.
      auth ??= assignment ? build(assignment) : undefined;
      return auth ?? null;
    },
  };
}
