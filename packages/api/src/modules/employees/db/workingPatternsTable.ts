import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { terms } from "./termsTable";

/**
 * A way of working: one set of terms' own, or a named one that people are put on one by one. Its
 * minutes over time are its versions.
 */
export const workingPatterns = pgTable(
  "working_patterns",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Null: a named pattern for one person at a time. */
    termsId: uuid("terms_id").unique("working_patterns_terms_unique"),
    /** Null on a terms' pattern, which their terms name. */
    name: text("name").unique("working_patterns_name_unique"),
  },
  (table) => [
    foreignKey({
      name: "working_patterns_terms_fk",
      columns: [table.termsId],
      foreignColumns: [terms.id],
    }).onDelete("cascade"),
    check(
      "working_patterns_named_unless_terms",
      sql`(${table.termsId} is null) = (${table.name} is not null)`,
    ),
    check("working_patterns_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);
