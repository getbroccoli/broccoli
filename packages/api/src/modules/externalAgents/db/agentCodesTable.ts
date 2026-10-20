import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { AGENT_WAYS } from "../domain";

/** Agent one-time codes the setup holder made, by hash; each is exchanged once at most. */
export const agentCodes = pgTable(
  "agent_codes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    secretHash: text("secret_hash").notNull().unique(),
    way: text("way", { enum: AGENT_WAYS }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "agent_codes_way",
      sql`${table.way} in ('answers_masked_questions', 'parses_original_files')`,
    ),
  ],
);
