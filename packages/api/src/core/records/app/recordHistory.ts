import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import { type Connection, type PageArgs, paginate } from "../../pagination";
import type { SecurityContext } from "../../security";
import { findUserEmails, HISTORY_SORT_VALUES, recordHistoryRepository } from "../db";
import {
  authorOf,
  type CauseKind,
  type HistoryAppend,
  type HistoryLine,
  type RecordOperation,
  type RecordType,
} from "../domain";

/** A change to one record, published once its transaction commits; it carries field keys, never values. */
export interface RecordChanged {
  historyId: string;
  recordType: RecordType;
  recordId: string;
  operation: RecordOperation;
  fields: string[];
  causeKind: CauseKind;
  causeRef: string | null;
}

declare module "../../events" {
  interface DomainEvents {
    "records.changed": RecordChanged;
  }
}

/**
 * Appends one history line per record in `tx`, made by the author of `ctx`, and publishes one
 * `records.changed` per line. Returns the lines in the order of `append.records`.
 */
export async function appendRecordHistory(
  ctx: SecurityContext,
  tx: Tx,
  { recordType, operation, cause, reason = null, records }: HistoryAppend,
): Promise<HistoryLine[]> {
  const author = authorOf(ctx);
  const lines = await recordHistoryRepository(tx).insert(
    records.map(({ recordId, changes }) => ({
      recordType,
      recordId,
      operation,
      author,
      cause: { kind: cause.kind, ref: cause.ref ?? null },
      reason,
      changes,
    })),
  );
  for (const line of lines) {
    tx.publish("records.changed", {
      historyId: line.id,
      recordType,
      recordId: line.recordId,
      operation,
      fields: line.changes.map(({ field }) => field),
      causeKind: line.cause.kind,
      causeRef: line.cause.ref,
    });
  }
  return lines;
}

/** One record's history, newest first, one page at a time. The caller authorizes the read. */
export function readRecordHistory(
  db: Orm | Tx,
  recordType: RecordType,
  recordId: string,
  args: PageArgs,
): Promise<Connection<HistoryLine>> {
  return paginate(args, {
    order: { field: "NEWEST", direction: "DESC" },
    keysetValues: { NEWEST: HISTORY_SORT_VALUES },
    fetch: ({ after, limit }) =>
      recordHistoryRepository(db).findPage({ recordType, recordId, after, limit }),
  });
}

/** The current email of each author among these users who still exists, by user id. */
export function readAuthorEmails(
  orm: Orm,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  return findUserEmails(orm, userIds);
}

/**
 * Deletes every history line of one record type in `tx`, without publishing; returns how many.
 * Only a deliberate reset calls it, such as leaving the demo, never an ordinary removal.
 */
export function purgeRecordHistory(tx: Tx, recordType: RecordType): Promise<number> {
  return recordHistoryRepository(tx).deleteRecordType(recordType);
}

/**
 * Who may read the history of each record type, registered by the module that owns it. A check
 * gets the record's id but must not need the record to exist: a deleted record keeps its history.
 */
export type RecordHistoryAccess = {
  [Type in RecordType]?: (ctx: SecurityContext, recordId: string) => void | Promise<void>;
};

/** Reads the history of a record of any type, for whoever its type's check allows. */
export interface RecordHistoryReader {
  /** Refuses with FORBIDDEN a record type without a check. */
  readHistory(
    ctx: SecurityContext,
    recordType: RecordType,
    recordId: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
}

export function createRecordHistoryReader(
  orm: Orm,
  access: RecordHistoryAccess,
): RecordHistoryReader {
  return {
    readHistory: async (ctx, recordType, recordId, args) => {
      const requireAccess = access[recordType];
      if (!requireAccess) {
        throw new ApplicationError("FORBIDDEN", "You cannot read this history.");
      }
      await requireAccess(ctx, recordId);
      return readRecordHistory(orm, recordType, recordId, args);
    },
  };
}
