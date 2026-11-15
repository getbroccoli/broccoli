import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../auth";

/** The people who closed the invitation to connect their agent on Today, for good. */
export const agentInvitationClosings = pgTable("agent_invitation_closings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
});
