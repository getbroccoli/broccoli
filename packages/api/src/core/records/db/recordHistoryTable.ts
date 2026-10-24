import { bigint, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { AuthorKind, CauseKind, FieldChange, RecordOperation } from "../domain";

/**
 * Every change to a record of any type, appended in the transaction of the change. Rows
 * are never updated; only an explicit purge of a record type deletes them.
 */
export const recordHistory = pgTable(
  "record_history",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    recordType: text("record_type").notNull(),
    /** No foreign key: history outlives the record it describes. */
    recordId: text("record_id").notNull(),
    operation: text("operation").$type<Lowercase<RecordOperation>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    authorKind: text("author_kind").$type<Lowercase<AuthorKind>>().notNull(),
    authorId: text("author_id"),
    causeKind: text("cause_kind").$type<Lowercase<CauseKind>>().notNull(),
    causeRef: text("cause_ref"),
    reason: text("reason"),
    changes: jsonb("changes").$type<FieldChange[]>().notNull(),
  },
  (table) => [
    // Serves a record's newest-first history, which is also the keyset of its cursor.
    index("record_history_record_idx").on(table.recordType, table.recordId, table.id),
  ],
);
