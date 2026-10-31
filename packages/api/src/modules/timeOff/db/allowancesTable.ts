import { sql } from "drizzle-orm";
import { check, date, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { timeOffTypes } from "./timeOffTypesTable";

/**
 * One person's allowance for one time off type and one leave year. Its amount is the sum of its
 * ledger lines; its dates are set once and never change. A person's allowances for one type
 * never overlap; the migration adds that exclusion constraint and the foreign key to employees,
 * which another module owns.
 */
export const allowances = pgTable(
  "allowances",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id").notNull(),
    timeOffTypeId: uuid("time_off_type_id")
      .notNull()
      .references(() => timeOffTypes.id),
    leaveYearStart: date("leave_year_start", { mode: "string" }).$type<CalendarDate>().notNull(),
    leaveYearEnd: date("leave_year_end", { mode: "string" }).$type<CalendarDate>().notNull(),
  },
  (table) => [
    index("allowances_time_off_type_idx").on(table.timeOffTypeId),
    check("allowances_dates_in_order", sql`${table.leaveYearEnd} >= ${table.leaveYearStart}`),
  ],
);
