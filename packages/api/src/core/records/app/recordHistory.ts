import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import { type Connection, type PageArgs, paginate } from "../../pagination";
import type { PermissionObject, SecurityContext } from "../../security";
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
export async function readRecordHistory(
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

/** What core needs from the module that owns a record type. */
export interface RecordTypeRegistration {
  /** The GraphQL type of its records, such as "Employee"; resolves `RecordChange.record`. */
  graphqlType: string;
  /**
   * Refuses with FORBIDDEN a caller who may not read this record type's history. It gets the
   * record's id but must not need the record to exist: a deleted record keeps its history.
   */
  requireHistoryAccess(ctx: SecurityContext, recordId: string): void | Promise<void>;
  /** The id as history stores it, such as an employee's lowercase uuid; null when it names no record. */
  canonicalId(recordId: string): string | null;
  /** The records that still exist among these canonical ids, by id, for a caller who may read them. */
  loadRecords(ctx: SecurityContext, ids: readonly string[]): Promise<Map<string, unknown>>;
  /** Its permission object, and the fields an update may change by their input names, for `access`. */
  permissions: { object: PermissionObject; editableFields: readonly string[] };
}

/** What the caller may do to one record, as `AnyRecord.access` shows it. */
export async function readRecordAccess(
  ctx: SecurityContext,
  { permissions: { object, editableFields } }: RecordTypeRegistration,
  recordId: string,
): Promise<{ canUpdate: boolean; canDelete: boolean; editableFields: string[] }> {
  // shortcut: the record is its own subject while employees are the only record type; a type
  // whose records belong to an employee adds how to find that employee.
  const { canUpdate, canDelete, writableFields } = await ctx.recordAccess(object, recordId);
  return {
    canUpdate,
    canDelete,
    editableFields: editableFields.filter(
      (field) => writableFields === "*" || writableFields.includes(field),
    ),
  };
}

/** A record as `RecordChange.record` returns it, marked with its GraphQL type. */
export type LoadedRecord = { __typename: string };

/** The record types that keep history, each registered by the module that owns it. */
export type RecordTypeRegistry = { [Type in RecordType]?: RecordTypeRegistration };

/** Reads the history of a record of any type, and its records, for whoever its type allows. */
export interface RecordHistoryReader {
  /** Refuses with FORBIDDEN a record type nobody registered; an id that names no record reads as empty. */
  readHistory(
    ctx: SecurityContext,
    recordType: RecordType,
    recordId: string,
    args: PageArgs,
  ): Promise<Connection<HistoryLine>>;
  /** The records still there among these ids, each marked with its GraphQL type, by id. */
  readRecords(
    ctx: SecurityContext,
    recordType: RecordType,
    ids: readonly string[],
  ): Promise<Map<string, LoadedRecord>>;
}

export function createRecordHistoryReader(
  orm: Orm,
  registry: RecordTypeRegistry,
): RecordHistoryReader {
  const registrationOf = (recordType: RecordType) => {
    const registration = registry[recordType];
    if (!registration) {
      throw new ApplicationError("FORBIDDEN", "You cannot read this history.");
    }
    return registration;
  };
  return {
    readHistory: async (ctx, recordType, recordId, args) => {
      const registration = registrationOf(recordType);
      await registration.requireHistoryAccess(ctx, recordId);
      const canonicalId = registration.canonicalId(recordId);
      return canonicalId === null
        ? { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
        : readRecordHistory(orm, recordType, canonicalId, args);
    },
    readRecords: async (ctx, recordType, ids) => {
      const registration = registrationOf(recordType);
      const records = await registration.loadRecords(ctx, ids);
      return new Map(
        [...records].map(([id, record]) => [
          id,
          { ...(record as object), __typename: registration.graphqlType },
        ]),
      );
    },
  };
}
