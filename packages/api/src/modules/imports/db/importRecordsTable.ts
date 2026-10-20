import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { files } from "../../../core/files";
import { importSources } from "./importSourcesTable";

/**
 * Proposed records of any type, one row per record a source delivered. `values` follow
 * the schema of `type` at `type_version`; `raw` keeps the source's values as they came.
 */
export const importRecords = pgTable(
  "import_records",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => importSources.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["employee"] }).notNull(),
    typeVersion: integer("type_version").notNull(),
    externalId: text("external_id").notNull(),
    raw: jsonb("raw").notNull(),
    values: jsonb("values").notNull(),
    /** Where the person's own photo can be downloaded; null for initials. */
    photoUrl: text("photo_url"),
    /** The stored copy of the photo at `photo_url`, once downloaded. */
    photoFileId: uuid("photo_file_id").references(() => files.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("import_records_source_record").on(table.sourceId, table.type, table.externalId),
  ],
);
