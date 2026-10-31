import { sql } from "drizzle-orm";
import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { timeOffTypes } from "./timeOffTypesTable";

/**
 * A person's time off, as colleagues see it on the calendar; a request is only its approval
 * step. The migration adds the foreign key to employees, which another module owns.
 */
export const timeOff = pgTable(
  "time_off",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id").notNull(),
    timeOffTypeId: uuid("time_off_type_id")
      .notNull()
      .references(() => timeOffTypes.id),
    note: text("note"),
    /** Never deleted to cancel. */
    status: text("status", {
      enum: ["pending_approval", "approved", "declined", "cancelled"],
    }).notNull(),
  },
  (table) => [
    index("time_off_employee_idx").on(table.employeeId),
    index("time_off_time_off_type_idx").on(table.timeOffTypeId),
  ],
);
