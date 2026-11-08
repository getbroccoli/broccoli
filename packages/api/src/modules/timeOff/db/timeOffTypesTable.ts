import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { TIME_OFF_TYPE_COLOURS, TIME_OFF_TYPE_ICONS, TIME_OFF_UNITS } from "../domain";

/** A kind of time off: the four the migration inserts, or the company's own. */
export const timeOffTypes = pgTable(
  "time_off_types",
  {
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
    /** Text with a check, so counting in another unit is no type migration. */
    unit: text("unit", { enum: TIME_OFF_UNITS }).notNull().default("day"),
    /** Null shows the default icon. */
    icon: text("icon", { enum: TIME_OFF_TYPE_ICONS }),
    /** Null shows the default colour. */
    colour: text("colour", { enum: TIME_OFF_TYPE_COLOURS }),
  },
  (table) => [
    // "Study leave" and " study LEAVE" are one type.
    uniqueIndex(TIME_OFF_TYPE_NAME_UNIQUE).on(sql`lower(btrim(${table.name}))`),
    check("time_off_types_unit_known", sql`${table.unit} in ('day', 'hour')`),
  ],
);

export const TIME_OFF_TYPE_NAME_UNIQUE = "time_off_types_name_unique";
