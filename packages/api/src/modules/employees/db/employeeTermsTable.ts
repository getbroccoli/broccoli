import { sql } from "drizzle-orm";
import { check, date, index, pgTable, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { employees } from "./employeesTable";
import { terms } from "./termsTable";

/**
 * Which terms a person is on, and when; one set of terms at a time, so a person's rows never overlap
 * (an exclusion constraint the migration adds). It counts only while they have an employment.
 */
export const employeeTerms = pgTable(
  "employee_terms",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    termsId: uuid("terms_id")
      .notNull()
      .references(() => terms.id),
    /** Null: since the employment started, for a person whose start date is unknown. */
    effectiveFrom: date("effective_from", { mode: "string" }).$type<CalendarDate>(),
    /** The last day the row applies; null: still on the terms. */
    effectiveUntil: date("effective_until", { mode: "string" }).$type<CalendarDate>(),
  },
  (table) => [
    index("employee_terms_terms_idx").on(table.termsId),
    check("employee_terms_dates_in_order", sql`${table.effectiveUntil} >= ${table.effectiveFrom}`),
  ],
);
