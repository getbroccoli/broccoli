import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { BANK_HOLIDAY_CALENDARS } from "../../bankHolidays";
import { terms } from "./termsTable";
import { workingPatterns } from "./workingPatternsTable";

/**
 * A pattern's minutes on each weekday and whose bank holidays apply, with no dates: assignments
 * say when it applies. A draft is edited until it is published; a published version never changes.
 */
export const workingPatternVersions = pgTable(
  "working_pattern_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workingPatternId: uuid("working_pattern_id").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    /** Set only on a draft: the terms whose screen saved it; publishing clears it. */
    termsId: uuid("terms_id"),
    /** 1 on creation, plus 1 on every save of a draft, so Publish sees what the admin reviewed. */
    revision: integer("revision").notNull().default(1),
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
    // Named here: the generated names would pass Postgres's 63-character limit.
    foreignKey({
      name: "working_pattern_versions_pattern_fk",
      columns: [table.workingPatternId],
      foreignColumns: [workingPatterns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "working_pattern_versions_terms_fk",
      columns: [table.termsId],
      foreignColumns: [terms.id],
    }).onDelete("cascade"),
    uniqueIndex("working_pattern_versions_one_draft_per_terms")
      .on(table.workingPatternId, table.termsId)
      .where(sql`${table.status} = 'draft'`),
    check("working_pattern_versions_status_known", sql`${table.status} in ('draft', 'published')`),
    check(
      "working_pattern_versions_terms_only_on_draft",
      sql`(${table.termsId} is not null) = (${table.status} = 'draft')`,
    ),
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
