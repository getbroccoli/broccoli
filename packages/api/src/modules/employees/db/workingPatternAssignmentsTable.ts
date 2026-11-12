import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { employees } from "./employeesTable";
import { terms } from "./termsTable";
import { workingPatternVersions } from "./workingPatternVersionsTable";

/**
 * Who works a pattern version from a date to a date: one person ahead of their terms, or one set
 * of terms. An owner's rows never overlap (exclusion constraints the migration adds).
 */
export const workingPatternAssignments = pgTable(
  "working_pattern_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workingPatternVersionId: uuid("working_pattern_version_id").notNull(),
    employeeId: uuid("employee_id"),
    termsId: uuid("terms_id"),
    startDate: date("start_date", { mode: "string" }).$type<CalendarDate>().notNull(),
    /** The last day the row applies; null: open-ended. */
    endDate: date("end_date", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated names would pass Postgres's 63-character limit.
    foreignKey({
      name: "working_pattern_assignments_version_fk",
      columns: [table.workingPatternVersionId],
      foreignColumns: [workingPatternVersions.id],
    }),
    foreignKey({
      name: "working_pattern_assignments_employee_fk",
      columns: [table.employeeId],
      foreignColumns: [employees.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "working_pattern_assignments_terms_fk",
      columns: [table.termsId],
      foreignColumns: [terms.id],
    }).onDelete("cascade"),
    index("working_pattern_assignments_version_idx").on(table.workingPatternVersionId),
    index("working_pattern_assignments_terms_idx").on(table.termsId),
    check(
      "working_pattern_assignments_one_owner",
      sql`num_nonnulls(${table.employeeId}, ${table.termsId}) = 1`,
    ),
    check(
      "working_pattern_assignments_dates_in_order",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
  ],
);
