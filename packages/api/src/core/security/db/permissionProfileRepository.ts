import { eq, inArray } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import { userPermissionProfiles } from "./userPermissionProfilesTable";

/** A profile that can be given to a user, as the table allows. */
type GivenProfile = (typeof userPermissionProfiles.$inferSelect)["profile"];

/** The permission profiles given to users, stored in Postgres; never the default one. */
export interface PermissionProfileRepository {
  /** Each user's stored profiles, by user id; users without any are left out. */
  findProfiles(userIds: readonly string[]): Promise<Map<string, GivenProfile[]>>;
  /** Replaces a user's stored profiles under a lock on the user and returns the ones it replaced. */
  replaceProfiles(userId: string, profiles: readonly GivenProfile[]): Promise<GivenProfile[]>;
}

export function permissionProfileRepository(db: Orm | Tx): PermissionProfileRepository {
  const orm = () => ormOf(db);
  const findProfiles = async (userIds: readonly string[]) => {
    const rows =
      userIds.length === 0
        ? []
        : await orm()
            .select()
            .from(userPermissionProfiles)
            .where(inArray(userPermissionProfiles.userId, [...userIds]));
    const profiles = new Map<string, GivenProfile[]>();
    for (const { userId, profile } of rows) {
      profiles.set(userId, [...(profiles.get(userId) ?? []), profile]);
    }
    return profiles;
  };
  return {
    findProfiles,

    replaceProfiles: async (userId, profiles) => {
      // Two saves at once take turns, so each sees what the other saved.
      await orm().select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
      const before = (await findProfiles([userId])).get(userId) ?? [];
      await orm().delete(userPermissionProfiles).where(eq(userPermissionProfiles.userId, userId));
      if (profiles.length > 0) {
        await orm()
          .insert(userPermissionProfiles)
          .values(profiles.map((profile) => ({ userId, profile })));
      }
      return before;
    },
  };
}
