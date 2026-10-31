import { sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * A named set of people who share the same settings, such as their time off policies. The
 * migration inserts the `everyone` group; code finds a group by its key, never its name.
 */
export const policyGroups = pgTable("policy_groups", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text("name").notNull(),
  /** Null on the groups a company creates. */
  key: text("key", { enum: ["everyone"] }).unique("policy_groups_key_unique"),
});
