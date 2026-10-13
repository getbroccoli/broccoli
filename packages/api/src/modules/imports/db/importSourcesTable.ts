import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Where the import's records come from: the Slack workspace, later uploaded files. */
export const importSources = pgTable(
  "import_sources",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text("kind", { enum: ["slack"] }).notNull(),
    name: text("name").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("import_sources_kind", sql`${table.kind} in ('slack')`),
    // One Slack workspace at a time; connecting another one renames this source.
    uniqueIndex("import_sources_one_slack")
      .on(table.kind)
      .where(sql`${table.kind} = 'slack'`),
  ],
);
