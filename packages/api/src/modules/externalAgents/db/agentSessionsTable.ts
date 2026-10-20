import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { AGENT_WAYS } from "../domain";

/** The sessions external agents got for their codes, by token hash; ended ones stay ended. */
export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    tokenHash: text("token_hash").notNull().unique(),
    way: text("way", { enum: AGENT_WAYS }).notNull(),
    client: text("client").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastCallAt: timestamp("last_call_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "agent_sessions_way",
      sql`${table.way} in ('answers_masked_questions', 'parses_original_files')`,
    ),
  ],
);
