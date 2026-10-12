import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Sign-in tickets already used, kept until they expire so each one works once. */
export const managedTicket = pgTable(
  "managed_ticket",
  {
    jti: text("jti").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("managed_ticket_expires_at").on(table.expiresAt)],
);
