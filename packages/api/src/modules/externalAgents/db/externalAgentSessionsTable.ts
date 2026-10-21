import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** The sessions external agents got for their codes, by token hash; ended ones stay ended. */
export const externalAgentSessions = pgTable("external_agent_sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  tokenHash: text("token_hash").notNull().unique(),
  client: text("client").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastCallAt: timestamp("last_call_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
