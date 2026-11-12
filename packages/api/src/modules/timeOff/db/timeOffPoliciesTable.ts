import { sql } from "drizzle-orm";
import { check, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timeOffTypes } from "./timeOffTypesTable";

/** A policy for one time off type: what its versions share. Its rules are its versions; who has them when, its assignments. */
export const timeOffPolicies = pgTable(
  "time_off_policies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffTypeId: uuid("time_off_type_id")
      .notNull()
      .references(() => timeOffTypes.id),
    /** Null on a policy made on the terms screen, which their terms and type name. */
    name: text("name"),
  },
  (table) => [
    // The target of the assignments' foreign key, which keeps a policy on its own type.
    unique("time_off_policies_id_type_unique").on(table.id, table.timeOffTypeId),
    uniqueIndex("time_off_policies_type_name_unique").on(
      table.timeOffTypeId,
      sql`lower(btrim(${table.name}))`,
    ),
    check("time_off_policies_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);
