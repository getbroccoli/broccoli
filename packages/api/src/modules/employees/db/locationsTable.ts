import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** A named place where people work, such as an office or "Remote"; a person is in one at a time. */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Trimmed, in the case it was given. */
    name: text("name").notNull(),
  },
  (table) => [
    // "Leeds" and " leeds" are one place.
    uniqueIndex(LOCATION_NAME_UNIQUE).on(sql`lower(btrim(${table.name}))`),
    check("locations_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);

export const LOCATION_NAME_UNIQUE = "locations_name_unique";
