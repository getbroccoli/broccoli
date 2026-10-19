import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { files } from "../../../core/files";

/** Where the import's records come from: the Slack workspace and uploaded files. */
export const importSources = pgTable(
  "import_sources",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text("kind", { enum: ["slack", "file"] }).notNull(),
    name: text("name").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: ["mapping", "mapped", "failed"] })
      .notNull()
      .default("mapped"),
    failure: text("failure", { enum: ["no_people_columns", "unavailable"] }),
    /** The AI provider's own words when it refused a file for good. */
    failureMessage: text("failure_message"),
    /** The current mapping run of a file: a job of an earlier run writes nothing. */
    mappingAttempt: integer("mapping_attempt").notNull().default(0),
    /** The uploaded file; set exactly for file sources. */
    fileId: uuid("file_id").references(() => files.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("import_sources_kind", sql`${table.kind} in ('slack', 'file')`),
    check("import_sources_status", sql`${table.status} in ('mapping', 'mapped', 'failed')`),
    check(
      "import_sources_failure",
      sql`(${table.status} = 'failed') = (${table.failure} is not null)`,
    ),
    check("import_sources_file", sql`(${table.kind} = 'file') = (${table.fileId} is not null)`),
    // One Slack workspace at a time; connecting another one renames this source.
    uniqueIndex("import_sources_one_slack")
      .on(table.kind)
      .where(sql`${table.kind} = 'slack'`),
  ],
);
