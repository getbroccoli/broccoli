import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * A process people turn on: its name and which version new runs use. Off while `turned_on_at` is
 * null; who turned it on or off is in its history.
 */
export const processes = pgTable(
  "processes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    /** How code and tasks' `process_key` name it. */
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Set once its first version is published; always one of its own published versions. */
    activeVersionId: uuid("active_version_id"),
    turnedOnAt: timestamp("turned_on_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "processes_active_version_fk",
      columns: [table.id, table.activeVersionId],
      foreignColumns: [processVersions.processId, processVersions.id],
    }),
    check("processes_key_not_blank", sql`btrim(${table.key}) <> ''`),
    check("processes_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);

/**
 * What a process does, version by version. A draft is edited until it is published; a published
 * version never changes, except a migration moving its definition to a new schema version.
 */
export const processVersions = pgTable(
  "process_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    processId: uuid("process_id")
      .notNull()
      .references((): AnyPgColumn => processes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    /** The shape of `definition`, so a migration can find and move older ones. */
    definitionSchemaVersion: integer("definition_schema_version").notNull(),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("process_versions_number_unique").on(table.processId, table.version),
    // The target of runs' and processes' composite keys: a version belongs to its process.
    unique("process_versions_process_id_unique").on(table.processId, table.id),
    uniqueIndex("process_versions_one_draft_per_process")
      .on(table.processId)
      .where(sql`${table.status} = 'draft'`),
    check("process_versions_status_known", sql`${table.status} in ('draft', 'published')`),
    check("process_versions_schema_version_positive", sql`${table.definitionSchemaVersion} > 0`),
  ],
);
