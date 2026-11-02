import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * A named way of working that groups and people are put on; its minutes are its weeks. The
 * migration inserts Standard; code finds it by its key, never its name.
 */
export const workingPatternPolicies = pgTable(
  "working_pattern_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    name: text("name").notNull().unique("working_pattern_policies_name_unique"),
    /** Set only on Standard, which cannot be deleted. */
    key: text("key", { enum: ["standard_working_pattern"] }).unique(
      "working_pattern_policies_key_unique",
    ),
  },
  (table) => [check("working_pattern_policies_name_not_blank", sql`btrim(${table.name}) <> ''`)],
);
