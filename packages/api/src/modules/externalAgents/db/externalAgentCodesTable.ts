import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Agent one-time codes the setup holder made, by hash; each is exchanged once at most. */
export const externalAgentCodes = pgTable("external_agent_codes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  secretHash: text("secret_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});
