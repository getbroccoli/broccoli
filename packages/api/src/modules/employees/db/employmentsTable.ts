import { sql } from "drizzle-orm";
import { check, date, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { employees } from "./employeesTable";

/**
 * A person's work for the company over a period, and who manages them then. Every employee has one
 * from their creation, and their employments never overlap: an exclusion constraint the migration
 * adds, since drizzle cannot declare one.
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
    /** Null: unknown. The first employment's start is the person's start date. */
    startDate: date("start_date", { mode: "string" }).$type<CalendarDate>(),
    /** Null: open-ended. */
    endDate: date("end_date", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    index("employments_direct_manager_idx").on(table.directManagerId),
    check("employments_not_own_manager", sql`${table.directManagerId} <> ${table.employeeId}`),
  ],
);
