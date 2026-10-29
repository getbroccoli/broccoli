import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";
import { employees } from "./employeesTable";

/** Invites to sign in, one open (not accepted, cancelled or replaced) per employee; expiry is a time, not a state. */
export const invites = pgTable(
  "employee_invites",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique("employee_invites_token_hash_unique"),
    profiles: text("profiles")
      .array()
      .$type<"ADMIN"[]>()
      .notNull()
      .default(sql`'{}'`),
    note: text("note"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sendFailedAt: timestamp("send_failed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
  },
  (table) => [
    // Serves the cascade when a person is deleted; the partial index skips closed invites.
    index("employee_invites_employee_idx").on(table.employeeId),
    uniqueIndex("employee_invites_one_open_per_employee")
      .on(table.employeeId)
      .where(
        sql`${table.acceptedAt} is null and ${table.cancelledAt} is null and ${table.replacedAt} is null`,
      ),
  ],
);
