import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { terms } from "./termsTable";

/** A named place where people work, such as an office or "Remote"; a person is in one at a time. */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** Trimmed, in the case it was given. */
    name: text("name").notNull(),
    /** The terms a person added here starts on; null: the default terms. */
    defaultTermsId: uuid("default_terms_id").references(() => terms.id),
  },
  (table) => [
    // "Leeds" and " leeds" are one place.
    uniqueIndex(LOCATION_NAME_UNIQUE).on(sql`lower(btrim(${table.name}))`),
    check("locations_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);

export const LOCATION_NAME_UNIQUE = "locations_name_unique";
