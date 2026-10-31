import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uuid } from "drizzle-orm/pg-core";

/** A kind of time off: the four the migration inserts, or the company's own. */
export const timeOffTypes = pgTable("time_off_types", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text("name").notNull(),
  needsApproval: boolean("needs_approval").notNull(),
  /** Colleagues see that the person is off, not why. */
  private: boolean("private").notNull(),
  /** Rules read the key, never the name; null on the company's own types. */
  typeKey: text("type_key", {
    enum: ["annual_leave", "sickness", "family_leave", "other"],
  }).unique("time_off_types_type_key_unique"),
});
