import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { terms } from "./termsTable";
import { workingPatterns } from "./workingPatternsTable";

/**
 * Which pattern the people on terms work by default, and when; the terms' rows never overlap (an
 * exclusion constraint the migration adds). Dated, so switching the terms keeps their past weeks.
 */
export const termsWorkingPatterns = pgTable(
  "terms_working_patterns",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    termsId: uuid("terms_id").notNull(),
    workingPatternId: uuid("working_pattern_id").notNull(),
    /** Null: from the beginning. */
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>(),
    /** The last day the row applies; null: open-ended. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated names would pass Postgres's 63-character limit.
    foreignKey({
      name: "terms_working_patterns_terms_fk",
      columns: [table.termsId],
      foreignColumns: [terms.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "terms_working_patterns_pattern_fk",
      columns: [table.workingPatternId],
      foreignColumns: [workingPatterns.id],
    }),
    index("terms_working_patterns_pattern_idx").on(table.workingPatternId),
    check(
      "terms_working_patterns_dates_in_order",
      sql`${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);
