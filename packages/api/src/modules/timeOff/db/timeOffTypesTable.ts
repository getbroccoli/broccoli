import { sql } from "drizzle-orm";
import { boolean, check, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    /** The rules offering the type on terms starts from, checked like a policy version's. */
    defaultBalance: text("default_balance", {
      enum: ["balance_from_allowance", "unlimited_balance", "no_balance"],
    })
      .notNull()
      .default("no_balance"),
    /** Days a year for a 5-day week. */
    defaultEntitlementDays: numeric("default_entitlement_days"),
    defaultBankHolidays: text("default_bank_holidays", {
      enum: ["bank_holidays_included_in_allowance", "bank_holidays_on_top_of_allowance"],
    }),
  },
  (table) => [
    // "Study leave" and " study LEAVE" are one type.
    uniqueIndex(TIME_OFF_TYPE_NAME_UNIQUE).on(sql`lower(btrim(${table.name}))`),
    check("time_off_types_unit_known", sql`${table.unit} in ('day', 'hour')`),
    check(
      "time_off_types_default_allowance_with_balance",
      sql`(${table.defaultEntitlementDays} is not null and ${table.defaultBankHolidays} is not null)
        = (${table.defaultBalance} = 'balance_from_allowance')`,
    ),
    check(
      "time_off_types_default_allowance_in_range",
      sql`${table.defaultEntitlementDays} between 0 and 366`,
    ),
  ],
);

export const TIME_OFF_TYPE_NAME_UNIQUE = "time_off_types_name_unique";
