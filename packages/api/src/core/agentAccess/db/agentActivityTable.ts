import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../auth";
import { AGENT_ACTIVITY_OUTCOMES } from "../domain";

/**
 * One row per tool call of a person's agent: which tool and how it ended, never what it read or
 * was asked. Kept 30 days, and after the connection ends.
 */
export const agentActivity = pgTable(
  "agent_activity",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The client's name stays in the OAuth provider's client row. */
    clientId: text("client_id").notNull(),
    tool: text("tool").notNull(),
    outcome: text("outcome", { enum: AGENT_ACTIVITY_OUTCOMES }).notNull(),
    resultCount: integer("result_count"),
    calledAt: timestamp("called_at", { withTimezone: true }).notNull(),
  },
  // Serves a person's newest-first activity, which is also the keyset of its cursor.
  (table) => [index("agent_activity_user_id_id_idx").on(table.userId, table.id)],
);
