import { sql } from "drizzle-orm";
import { date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { timeOff } from "./timeOffTable";

/**
 * One day of a time off: what the person asked for, not what it costs. The cost is written as
 * ledger lines, so it can be worked out again when bank holidays or working patterns change.
 */
export const timeOffDays = pgTable(
  "time_off_days",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    timeOffId: uuid("time_off_id")
      .notNull()
      .references(() => timeOff.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).$type<CalendarDate>().notNull(),
    dayPart: text("day_part", { enum: ["full_day", "morning", "afternoon"] }).notNull(),
    /** Set when this day alone is cancelled; the day stays and costs nothing. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [unique("time_off_days_time_off_date_unique").on(table.timeOffId, table.date)],
);
