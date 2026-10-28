import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { user } from "../../auth";

/**
 * The extra permission profiles of each user, beside `EMPLOYEE`, which everyone has and is never
 * stored, and `OWNER`, which comes from owning the instance.
 */
export const userPermissionProfiles = pgTable(
  "user_permission_profiles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    profile: text("profile").$type<"ADMIN">().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.profile] }),
    check("user_permission_profiles_assignable", sql`${table.profile} in ('ADMIN')`),
  ],
);
