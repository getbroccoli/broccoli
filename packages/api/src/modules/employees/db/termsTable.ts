import { sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * A named set of people who share the same working pattern and time off policies. The migration
 * inserts the `default_terms` terms, "England and Wales"; code finds terms by their key, never their name.
 */
export const terms = pgTable("terms", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text("name").notNull(),
  /** Null on the terms a company creates. */
  key: text("key", { enum: ["default_terms"] }).unique("terms_key_unique"),
});
