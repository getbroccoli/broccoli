import { eq, inArray, sql } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import { userPermissionProfiles } from "./userPermissionProfilesTable";

/** A profile a user can be given beside the base one. */
export type ExtraProfile = (typeof userPermissionProfiles.$inferSelect)["profile"];

/** The extra permission profiles of users, stored in Postgres. */
export interface PermissionProfileRepository {
  /** Each user's extra profiles, by user id; users without any are left out. */
  findExtras(userIds: readonly string[]): Promise<Map<string, ExtraProfile[]>>;
  /** Replaces a user's extra profiles under a lock on the user and returns the ones it replaced. */
  replaceExtras(userId: string, extras: readonly ExtraProfile[]): Promise<ExtraProfile[]>;
}

export function permissionProfileRepository(db: Orm | Tx): PermissionProfileRepository {
  const orm = () => ormOf(db);
  const findExtras = async (userIds: readonly string[]) => {
    const rows =
      userIds.length === 0
        ? []
        : await orm()
            .select()
            .from(userPermissionProfiles)
            .where(inArray(userPermissionProfiles.userId, [...userIds]));
    const extras = new Map<string, ExtraProfile[]>();
    for (const { userId, profile } of rows) {
      extras.set(userId, [...(extras.get(userId) ?? []), profile]);
    }
    return extras;
  };
  return {
    findExtras,

    replaceExtras: async (userId, extras) => {
      // Two saves at once take turns, so each sees what the other saved.
      await orm().execute(sql`select 1 from ${user} where ${user.id} = ${userId} for update`);
      const before = (await findExtras([userId])).get(userId) ?? [];
      await orm().delete(userPermissionProfiles).where(eq(userPermissionProfiles.userId, userId));
      if (extras.length > 0) {
        await orm()
          .insert(userPermissionProfiles)
          .values(extras.map((profile) => ({ userId, profile })));
      }
      return before;
    },
  };
}
