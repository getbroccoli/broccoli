import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** The connected Slack workspace, at most one row; the token is sealed with the encryption key. */
export const slackConnection = pgTable(
  "slack_connection",
  {
    id: boolean("id").primaryKey().default(true),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    sealedToken: text("sealed_token").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("slack_connection_singleton", sql`${table.id}`)],
);
