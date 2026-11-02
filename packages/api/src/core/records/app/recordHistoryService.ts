import type { Orm, Tx } from "../../db";
import { type Connection, type PageArgs, paginate } from "../../pagination";
import type { SecurityContext } from "../../security";
import { HISTORY_SORT_VALUES, recordHistoryRepository } from "../db";
import {
  authorOf,
  type CauseKind,
  type HistoryAppend,
  type HistoryLine,
  type RecordOperation,
  type RecordType,
} from "../domain";

/** Writes and raw reads of record history, in the caller's `db` or `tx`; the caller authorizes them. */
export interface RecordHistoryService {
  /**
   * Appends one history line per record in `tx`, made by the author of `ctx`, and publishes one
   * `records.changed` per line. Returns the lines in the order of `append.records`.
   */
  append(ctx: SecurityContext, tx: Tx, append: HistoryAppend): Promise<HistoryLine[]>;
  /** One record's history, newest first, one page at a time. */
  read(
    db: Orm | Tx,
    recordType: RecordType,
    recordId: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
  /**
   * Deletes every history line of one record type in `tx`, without publishing; returns how many.
   * Only a deliberate reset calls it, such as leaving the demo, never an ordinary removal.
   */
  purge(tx: Tx, recordType: RecordType): Promise<number>;
}

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

export function createRecordHistoryService(): RecordHistoryService {
  return {
    async append(ctx, tx, { recordType, operation, cause, reason = null, records }) {
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
    },
    read: async (db, recordType, recordId, args) =>
      paginate(args, {
        order: { field: "NEWEST", direction: "DESC" },
        keysetValues: { NEWEST: HISTORY_SORT_VALUES },
        fetch: ({ after, limit }) =>
          recordHistoryRepository(db).findPage({ recordType, recordId, after, limit }),
      }),
    purge: (tx, recordType) => recordHistoryRepository(tx).deleteRecordType(recordType),
  };
}
