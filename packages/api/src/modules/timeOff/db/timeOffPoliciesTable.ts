import { sql } from "drizzle-orm";
import { check, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timeOffTypes } from "./timeOffTypesTable";

/**
 * A policy for one time off type: one set of terms' for it, or a named one that people are put on
 * one by one. Its rules over time are its versions; the migration adds the foreign key to terms,
 * which another module owns.
 */
export const timeOffPolicies = pgTable(
  "time_off_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffTypeId: uuid("time_off_type_id")
      .notNull()
      .references(() => timeOffTypes.id),
    /** Null: a named policy for one person at a time. */
    termsId: uuid("terms_id"),
    /** Null on a terms' policy, which their terms and type name. */
    name: text("name"),
  },
  (table) => [
    // The target of the assignments' foreign key, which keeps a policy on its own type.
    unique("time_off_policies_id_type_unique").on(table.id, table.timeOffTypeId),
    unique("time_off_policies_terms_type_unique").on(table.termsId, table.timeOffTypeId),
    uniqueIndex("time_off_policies_type_name_unique").on(
      table.timeOffTypeId,
      sql`lower(btrim(${table.name}))`,
    ),
    check(
      "time_off_policies_named_unless_terms",
      sql`(${table.termsId} is null) = (${table.name} is not null)`,
    ),
    check("time_off_policies_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);
