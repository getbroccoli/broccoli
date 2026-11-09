import { ApplicationError } from "../../applicationError";
import type { Orm, Tx } from "../../db";
import type { Connection } from "../../pagination";
import {
  isInRecordScope,
  type PermissionObject,
  type SecurityContext,
  type Subject,
} from "../../security";
import { findUserEmails } from "../db";
import type { FieldChange, HistoryLine, RecordType } from "../domain";
import { createRecordHistoryService, type HistoryPageArgs } from "./recordHistoryService";

/** Reads the history of a record of any type, its records and their access, for whoever its type allows. */
export interface RecordHistoryReaderService {
  /** Refuses with FORBIDDEN a record type nobody registered; an id that names no record reads as empty. */
  readHistory: (
    ctx: SecurityContext,
    recordType: RecordType,
    recordId: string,
    args: HistoryPageArgs,
  ) => Promise<Connection<HistoryLine>>;
  /** The records still there among these ids, each marked with its GraphQL type, by id. */
  readRecords: (
    ctx: SecurityContext,
    recordType: RecordType,
    ids: readonly string[],
  ) => Promise<Map<string, LoadedRecord>>;
  /**
   * The lines, in their order, with each value that names a record the caller may not read hidden:
   * value and label null, its flag set. A record that is gone stays shown only to a caller who
   * reads every record of its type. Never refuses.
   */
  hideOutOfScopeReferences: (
    ctx: SecurityContext,
    lines: readonly HistoryLine[],
  ) => Promise<VisibleHistoryLine[]>;
  /** The current email of each author among these users who still exists, by user id. */
  readAuthorEmails: (userIds: readonly string[]) => Promise<Map<string, string>>;
  /** What the caller may do to each of these records, by id, as `AnyRecord.access` shows it. */
  readAccess: (
    ctx: SecurityContext,
    recordType: RecordType,
    recordIds: readonly string[],
  ) => Promise<Map<string, { canUpdate: boolean; canDelete: boolean; editableFields: string[] }>>;
}

/** What core needs from the module that owns a record type. */
export interface RecordTypeRegistration {
  /** The GraphQL type of its records, such as "Employee"; resolves `RecordChange.record`. */
  graphqlType: string;
  /** The id as history stores it, such as an employee's lowercase uuid; null when it names no record. */
  canonicalId(recordId: string): string | null;
  /**
   * The subject of each record that still exists among these canonical ids, by id, or "public";
   * core decides from it who may read the record, its history and what they may do to it.
   */
  subjectsOf(ids: readonly string[]): Promise<Map<string, Subject>>;
  /** The records that still exist among these canonical ids, by id; core keeps those the caller may read. */
  loadRecords(ids: readonly string[]): Promise<Map<string, unknown>>;
  /** Its permission object, and the fields an update may change by their input names, for `access`. */
  permissions: { object: PermissionObject; editableFields: readonly string[] };
  /** The change fields in its history whose values are ids of another record type, by field. */
  references?: Partial<Record<string, RecordType>>;
  /**
   * Starts a new record from the one with `id` under `name`, inside `tx`, and returns its id;
   * absent when records of the type cannot be cloned. It checks the caller's permission.
   */
  clone?: (ctx: SecurityContext, tx: Tx, input: { id: string; name: string }) => Promise<string>;
}

/** A field change as a reader sees it: a value naming a record they may not read is hidden. */
export type VisibleFieldChange = FieldChange & { oldHidden: boolean; newHidden: boolean };

/** A history line as a reader sees it. */
export type VisibleHistoryLine = Omit<HistoryLine, "changes"> & { changes: VisibleFieldChange[] };

/** A record as `RecordChange.record` returns it, marked with its GraphQL type. */
export type LoadedRecord = { __typename: string; id: string };

/** The record types that keep history, each registered by the module that owns it. */
export type RecordTypeRegistry = { [Type in RecordType]?: RecordTypeRegistration };

export function createRecordHistoryReaderService(
  orm: Orm,
  registry: RecordTypeRegistry,
): RecordHistoryReaderService {
  const history = createRecordHistoryService();
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
      const { object } = registration.permissions;
      const canonicalId = registration.canonicalId(recordId);
      // A record that is gone has no subject: only a caller who reads every record reads its history.
      const subject =
        canonicalId && (await registration.subjectsOf([canonicalId])).get(canonicalId);
      if (subject) {
        await ctx.requireInScope(object, "read", subject);
      } else {
        ctx.requireEveryRecord(object, "read");
      }
      return canonicalId === null
        ? { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
        : history.read(orm, recordType, canonicalId, args);
    },
    readRecords: async (ctx, recordType, ids) => {
      const registration = registrationOf(recordType);
      const [scope, subjects, records] = await Promise.all([
        ctx.recordScope(registration.permissions.object, "read"),
        registration.subjectsOf(ids),
        registration.loadRecords(ids),
      ]);
      return new Map(
        [...records]
          .filter(([id]) => {
            const subject = subjects.get(id);
            return subject !== undefined && isInRecordScope(scope, subject);
          })
          .map(([id, record]) => [
            id,
            { ...(record as { id: string }), __typename: registration.graphqlType },
          ]),
      );
    },
    hideOutOfScopeReferences: async (ctx, lines) => {
      const referencedIds = new Map<RecordType, Set<string>>();
      for (const line of lines) {
        for (const { field, oldValue, newValue } of line.changes) {
          const type = registry[line.recordType]?.references?.[field];
          if (!type) continue;
          const ids = referencedIds.get(type) ?? new Set<string>();
          for (const id of [oldValue, newValue]) if (id !== null) ids.add(id);
          referencedIds.set(type, ids);
        }
      }
      const readable = new Map<RecordType, (id: string) => boolean>();
      for (const [type, ids] of referencedIds) {
        readable.set(type, await readableAmong(ctx, registry[type], [...ids]));
      }
      return lines.map((line) => ({
        ...line,
        changes: line.changes.map((change) => {
          const type = registry[line.recordType]?.references?.[change.field];
          const shown = (id: string | null) => !type || id === null || readable.get(type)!(id);
          const [oldShown, newShown] = [shown(change.oldValue), shown(change.newValue)];
          return {
            ...change,
            ...(oldShown ? {} : { oldValue: null, oldLabel: null }),
            ...(newShown ? {} : { newValue: null, newLabel: null }),
            oldHidden: !oldShown,
            newHidden: !newShown,
          };
        }),
      }));
    },
    readAuthorEmails: (userIds) => findUserEmails(orm, userIds),
    readAccess: async (ctx, recordType, recordIds) => {
      const registration = registrationOf(recordType);
      const { object, editableFields } = registration.permissions;
      const subjects = await registration.subjectsOf(recordIds);
      const access = await ctx.recordAccess(object, [...new Set(subjects.values())]);
      return new Map(
        recordIds.map((id) => {
          const subject = subjects.get(id);
          const found = subject === undefined ? undefined : access.get(subject);
          if (!found) return [id, { canUpdate: false, canDelete: false, editableFields: [] }];
          const { canUpdate, canDelete, writableFields } = found;
          return [
            id,
            {
              canUpdate,
              canDelete,
              editableFields: editableFields.filter(
                (field) => writableFields === "*" || writableFields.includes(field),
              ),
            },
          ];
        }),
      );
    },
  };
}

/**
 * Which of these ids of one record type the caller may read: by their subjects, or, for a record
 * that is gone, only with a read reaching every record. An unregistered type reads as none.
 */
async function readableAmong(
  ctx: SecurityContext,
  registration: RecordTypeRegistration | undefined,
  ids: readonly string[],
): Promise<(id: string) => boolean> {
  if (!registration) return () => false;
  const canonical = ids.filter((id) => registration.canonicalId(id) === id);
  const [scope, subjects] = await Promise.all([
    ctx.recordScope(registration.permissions.object, "read"),
    registration.subjectsOf(canonical),
  ]);
  return (id) => {
    const subject = subjects.get(id);
    return subject === undefined ? scope === "all" : isInRecordScope(scope, subject);
  };
}
