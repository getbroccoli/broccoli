import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../auth";
import { AGENT_CONNECTION_ENDINGS } from "../domain";

/**
 * Agent connections that have ended, one row each, so a person sees why their last one ended.
 * The client's name stays in the OAuth provider's client row.
 */
export const agentConnectionEndings = pgTable(
  "agent_connection_endings",
  {
    /** The ended connection's consent id. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    reason: text("reason", { enum: AGENT_CONNECTION_ENDINGS }).notNull(),
  },
  (table) => [
    index("agent_connection_endings_user_id_ended_at_idx").on(table.userId, table.endedAt),
  ],
);
