import { sql } from "drizzle-orm";
import { check, date, foreignKey, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS } from "../../bankHolidays";
import { workingPatterns } from "./workingPatternsTable";

/**
 * A pattern's minutes on each weekday from a date to a date. Never edited: a change ends one and
 * adds the next, so earlier days keep their minutes. A pattern's versions never overlap (an
 * exclusion constraint the migration adds).
 */
export const workingPatternVersions = pgTable(
  "working_pattern_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workingPatternId: uuid("working_pattern_id").notNull(),
    /** Null: from the beginning. */
    startDate: date("start_date", { mode: "string" }).$type<CalendarDate>(),
    /** The last day it applies; null: open-ended. */
    endDate: date("end_date", { mode: "string" }).$type<CalendarDate>(),
    mondayMinutes: integer("monday_minutes").notNull(),
    tuesdayMinutes: integer("tuesday_minutes").notNull(),
    wednesdayMinutes: integer("wednesday_minutes").notNull(),
    thursdayMinutes: integer("thursday_minutes").notNull(),
    fridayMinutes: integer("friday_minutes").notNull(),
    saturdayMinutes: integer("saturday_minutes").notNull(),
    sundayMinutes: integer("sunday_minutes").notNull(),
    /** Whose bank holidays apply. Text with a check, so a new region is no type migration. */
    bankHolidayCalendar: text("bank_holiday_calendar", { enum: BANK_HOLIDAY_CALENDARS })
      .notNull()
      .default("england_and_wales"),
  },
  (table) => [
    // Named here: the generated name would pass Postgres's 63-character limit.
    foreignKey({
      name: "working_pattern_versions_pattern_fk",
      columns: [table.workingPatternId],
      foreignColumns: [workingPatterns.id],
    }).onDelete("cascade"),
    check("working_pattern_versions_dates_in_order", sql`${table.endDate} >= ${table.startDate}`),
    check(
      "working_pattern_versions_minutes_in_a_day",
      sql`least(${table.mondayMinutes}, ${table.tuesdayMinutes}, ${table.wednesdayMinutes},
        ${table.thursdayMinutes}, ${table.fridayMinutes}, ${table.saturdayMinutes},
        ${table.sundayMinutes}) >= 0
        and greatest(${table.mondayMinutes}, ${table.tuesdayMinutes}, ${table.wednesdayMinutes},
        ${table.thursdayMinutes}, ${table.fridayMinutes}, ${table.saturdayMinutes},
        ${table.sundayMinutes}) between 1 and 1440`,
    ),
    check(
      "working_pattern_versions_bank_holiday_calendar_known",
      sql`${table.bankHolidayCalendar} in ('england_and_wales', 'scotland', 'northern_ireland')`,
    ),
  ],
);
