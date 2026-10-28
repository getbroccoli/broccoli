import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "../../../core/auth";
import type { InviteDelivery } from "../domain";
import { employees } from "./employeesTable";

/** Invites to sign in, one open (not accepted, cancelled or replaced) per employee; expiry is a time, not a state. */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique("invites_token_hash_unique"),
    profiles: text("profiles")
      .array()
      .$type<"ADMIN"[]>()
      .notNull()
      .default(sql`'{}'`),
    note: text("note"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    delivery: text("delivery").$type<InviteDelivery>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sendFailedAt: timestamp("send_failed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("invites_one_open_per_employee")
      .on(table.employeeId)
      .where(
        sql`${table.acceptedAt} is null and ${table.cancelledAt} is null and ${table.replacedAt} is null`,
      ),
  ],
);
