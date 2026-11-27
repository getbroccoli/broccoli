import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tasks } from "./tasksTable";

/**
 * One-time tokens of decision cards a person's connected agent showed them: only the hash is kept,
 * for one task, user and agent connection, until it expires or decides the task.
 */
export const taskDecisionTokens = pgTable(
  "task_decision_tokens",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    tokenHash: text("token_hash").notNull().unique(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    agentConnectionId: text("agent_connection_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Deleting a task deletes its tokens; the index keeps that from scanning every token.
  (table) => [index("task_decision_tokens_task_idx").on(table.taskId)],
);
