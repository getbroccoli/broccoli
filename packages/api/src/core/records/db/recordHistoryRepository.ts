import { and, desc, eq, lt, not, type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { type Orm, ormOf, type Tx } from "../../db";
import type { KeysetRow } from "../../pagination";
import type {
  AuthorKind,
  CauseKind,
  HistoryAuthor,
  HistoryCause,
  HistoryLine,
  RecordOperation,
  RecordType,
} from "../domain";
import { recordHistory } from "./recordHistoryTable";

/** Record history stored in Postgres; lines are only ever appended or purged by record type. */
export interface RecordHistoryRepository {
  /** Inserts the lines in one statement and returns them in the same order. */
  insert(lines: readonly NewHistoryLine[]): Promise<HistoryLine[]>;
  /** Up to `limit` of one record's lines that pass its field filter, newest first, older than the line `after`. */
  findPage(query: HistoryPageQuery): Promise<KeysetRow<HistoryLine, HistorySortValues>[]>;
  /** Deletes every line of one record type; returns how many. */
  deleteRecordType(recordType: RecordType): Promise<number>;
}

export type NewHistoryLine = Omit<HistoryLine, "id" | "occurredAt">;

/** A line's sort values in a cursor: its id. */
export type HistorySortValues = [string];

// A history id fits a signed 64-bit integer; a larger one in a cursor is no cursor this API issued.
export const HISTORY_SORT_VALUES = z.tuple([
  z
    .string()
    .regex(/^\d{1,19}$/)
    .refine((id) => BigInt(id) <= MAX_HISTORY_ID),
]);

export interface HistoryPageQuery extends HistoryFieldFilter {
  recordType: RecordType;
  recordId: string;
  after: HistorySortValues | null;
  limit: number;
}

/**
 * Keeps the lines that change at least one of `changingAnyOf` and none of `changingNoneOf`; absent
 * lists keep every line. A name ending in `*` matches every field that starts with the rest.
 */
export interface HistoryFieldFilter {
  changingAnyOf?: readonly string[];
  changingNoneOf?: readonly string[];
}

export function recordHistoryRepository(db: Orm | Tx): RecordHistoryRepository {
  const orm = () => ormOf(db);

  return {
    insert: async (lines) => {
      const inserted: HistoryLine[] = [];
      for (let start = 0; start < lines.length; start += INSERT_BATCH_SIZE) {
        const rows = await orm()
          .insert(recordHistory)
          .values(lines.slice(start, start + INSERT_BATCH_SIZE).map(toRow))
          .returning();
        inserted.push(...rows.map(toHistoryLine));
      }
      return inserted;
    },

    findPage: async ({ recordType, recordId, after, limit, changingAnyOf, changingNoneOf }) => {
      const rows = await orm()
        .select()
        .from(recordHistory)
        .where(
          and(
            eq(recordHistory.recordType, recordType),
            eq(recordHistory.recordId, recordId),
            after ? lt(recordHistory.id, BigInt(after[0])) : undefined,
            changingAnyOf ? changesAnyOf(changingAnyOf) : undefined,
            changingNoneOf ? not(changesAnyOf(changingNoneOf)) : undefined,
          ),
        )
        .orderBy(desc(recordHistory.id))
        .limit(limit);
      return rows.map((row) => ({ node: toHistoryLine(row), values: [String(row.id)] }));
    },

    deleteRecordType: async (recordType) => {
      const deleted = await orm()
        .delete(recordHistory)
        .where(eq(recordHistory.recordType, recordType))
        .returning({ id: recordHistory.id });
      return deleted.length;
    },
  };
}

const MAX_HISTORY_ID = 9_223_372_036_854_775_807n;

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

type HistoryRow = typeof recordHistory.$inferSelect;

// The query builder cannot look inside a jsonb array (RULE67); every name is a parameter.
function changesAnyOf(fields: readonly string[]): SQL {
  if (fields.length === 0) return sql`false`;
  const matches = fields.map((field) =>
    field.endsWith("*")
      ? sql`starts_with(change ->> 'field', ${field.slice(0, -1)})`
      : sql`change ->> 'field' = ${field}`,
  );
  return sql`exists (select 1 from jsonb_array_elements(${recordHistory.changes}) as change where ${sql.join(matches, sql` or `)})`;
}

function toRow({ author, cause, operation, ...line }: NewHistoryLine) {
  return {
    ...line,
    operation: lowercase(operation),
    authorKind: lowercase(author.kind),
    authorId: author.id,
    causeKind: lowercase(cause.kind),
    causeRef: cause.ref,
  };
}

function toHistoryLine(row: HistoryRow): HistoryLine {
  const author: HistoryAuthor = { kind: uppercase<AuthorKind>(row.authorKind), id: row.authorId };
  const cause: HistoryCause = { kind: uppercase<CauseKind>(row.causeKind), ref: row.causeRef };
  return {
    id: String(row.id),
    recordType: row.recordType as RecordType,
    recordId: row.recordId,
    operation: uppercase<RecordOperation>(row.operation),
    occurredAt: row.occurredAt,
    author,
    cause,
    reason: row.reason,
    changes: row.changes,
  };
}

// Stored values are the snake-case form of their names (RULE54).
function lowercase<Value extends string>(value: Value): Lowercase<Value> {
  return value.toLowerCase() as Lowercase<Value>;
}

function uppercase<Value extends string>(value: Lowercase<Value>): Value {
  return value.toUpperCase() as Value;
}
