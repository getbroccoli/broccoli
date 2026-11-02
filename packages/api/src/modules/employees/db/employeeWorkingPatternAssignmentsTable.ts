import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { employees } from "./employeesTable";
import { workingPatterns } from "./workingPatternsTable";

/**
 * An exception: one person on a pattern between two dates, ahead of their group's. A person's rows
 * never overlap (an exclusion constraint the migration adds).
 */
export const employeeWorkingPatternAssignments = pgTable(
  "employee_working_pattern_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id").notNull(),
    workingPatternId: uuid("working_pattern_id").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>().notNull(),
    /** The last day the row applies; null: open-ended. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    // Named here: the generated names would pass Postgres's 63-character limit.
    foreignKey({
      name: "employee_working_pattern_assignments_employee_fk",
      columns: [table.employeeId],
      foreignColumns: [employees.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "employee_working_pattern_assignments_pattern_fk",
      columns: [table.workingPatternId],
      foreignColumns: [workingPatterns.id],
    }),
    index("employee_working_pattern_assignments_pattern_idx").on(table.workingPatternId),
    check(
      "employee_working_pattern_assignments_dates_in_order",
      sql`${table.effectiveUntil} >= ${table.effectiveFrom}`,
    ),
  ],
);
