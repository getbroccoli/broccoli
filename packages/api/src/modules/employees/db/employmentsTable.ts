import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { employees } from "./employeesTable";

/**
 * A person's work for the company over a period, and who manages them then. A person's
 * employments never overlap: an exclusion constraint the migration adds, since drizzle cannot
 * declare one.
 */
export const employments = pgTable(
  "employments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    directManagerId: uuid("direct_manager_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    /** Percent of full time. */
    fte: integer("fte").notNull().default(100),
    /** Null: since the person joined. */
    startDate: date("start_date", { mode: "string" }).$type<CalendarDate>(),
    /** Null: open-ended. */
    endDate: date("end_date", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    index("employments_direct_manager_idx").on(table.directManagerId),
    check("employments_fte_range", sql`${table.fte} between 1 and 100`),
    check("employments_not_own_manager", sql`${table.directManagerId} <> ${table.employeeId}`),
  ],
);
