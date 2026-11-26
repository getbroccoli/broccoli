import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timeOffTypes } from "./timeOffTypesTable";

/**
 * A person's time off, as colleagues see it on the calendar: booked straight away, or requested and
 * waiting for approval. The migration adds the foreign keys to employees, which another module owns.
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
    /** Where it stands, never what waits on it; never deleted to cancel. */
    status: text("status", { enum: ["requested", "approved", "rejected", "cancelled"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** The signed-in user who booked or requested it; null when Broccoli itself did. */
    createdByUserId: text("created_by_user_id"),
    /** When it was asked for with approval; null for a booking. */
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    /** When its approval was decided; null for a booking and until then. */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Who decided it; null once that employee is deleted (the migration's foreign key). */
    decidedByEmployeeId: uuid("decided_by_employee_id"),
    /** The approver's comment, such as why it was rejected. */
    decisionComment: text("decision_comment"),
  },
  (table) => [
    index("time_off_employee_idx").on(table.employeeId),
    index("time_off_time_off_type_idx").on(table.timeOffTypeId),
    // Deleting an employee clears the decisions they made without scanning all time off.
    index("time_off_decided_by_idx").on(table.decidedByEmployeeId),
  ],
);
