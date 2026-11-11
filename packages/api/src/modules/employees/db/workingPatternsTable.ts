import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";

/** A way of working: what its versions share. Its settings are its versions; who works it when, its assignments. */
export const workingPatterns = pgTable(
  "working_patterns",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Null on a pattern made on the terms screen, which their terms name. */
    name: text("name").unique("working_patterns_name_unique"),
  },
  (table) => [check("working_patterns_name_not_blank", sql`btrim(${table.name}) <> ''`)],
);
