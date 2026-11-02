import { sql } from "drizzle-orm";
import { check, date, foreignKey, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { BANK_HOLIDAY_CALENDARS } from "../domain";
import { workingPatterns } from "./workingPatternsTable";

/**
 * A pattern's minutes on each weekday from a date until its next week starts. A change to a pattern
 * is a new row, so the weeks before it keep their minutes.
 */
export const workingPatternWeeks = pgTable(
  "working_pattern_weeks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workingPatternId: uuid("working_pattern_id").notNull(),
    /** Null only on the pattern's first week: from the beginning. */
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>(),
    mondayMinutes: integer("monday_minutes").notNull(),
    tuesdayMinutes: integer("tuesday_minutes").notNull(),
    wednesdayMinutes: integer("wednesday_minutes").notNull(),
    thursdayMinutes: integer("thursday_minutes").notNull(),
    fridayMinutes: integer("friday_minutes").notNull(),
    saturdayMinutes: integer("saturday_minutes").notNull(),
    sundayMinutes: integer("sunday_minutes").notNull(),
    /** The minutes one day of leave stands for. */
    fullDayMinutes: integer("full_day_minutes").notNull(),
    /** Whose bank holidays apply. Text with a check, so a new region is no type migration. */
    bankHolidayCalendar: text("bank_holiday_calendar", { enum: BANK_HOLIDAY_CALENDARS })
      .notNull()
      .default("england_and_wales"),
  },
  (table) => [
    // Named here: the generated name would pass Postgres's 63-character limit.
    foreignKey({
      name: "working_pattern_weeks_pattern_fk",
      columns: [table.workingPatternId],
      foreignColumns: [workingPatterns.id],
    }).onDelete("cascade"),
    unique("working_pattern_weeks_pattern_from_unique")
      .on(table.workingPatternId, table.effectiveFrom)
      .nullsNotDistinct(),
    check(
      "working_pattern_weeks_minutes_in_a_day",
      sql`least(${table.mondayMinutes}, ${table.tuesdayMinutes}, ${table.wednesdayMinutes},
        ${table.thursdayMinutes}, ${table.fridayMinutes}, ${table.saturdayMinutes},
        ${table.sundayMinutes}) >= 0
        and greatest(${table.mondayMinutes}, ${table.tuesdayMinutes}, ${table.wednesdayMinutes},
        ${table.thursdayMinutes}, ${table.fridayMinutes}, ${table.saturdayMinutes},
        ${table.sundayMinutes}) between 1 and ${table.fullDayMinutes}`,
    ),
    check("working_pattern_weeks_full_day_in_a_day", sql`${table.fullDayMinutes} <= 1440`),
    check(
      "working_pattern_weeks_bank_holiday_calendar_known",
      sql`${table.bankHolidayCalendar} in ('england_and_wales', 'scotland', 'northern_ireland')`,
    ),
  ],
);
