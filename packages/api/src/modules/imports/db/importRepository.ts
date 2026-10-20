import { and, count, eq, gt, inArray, notInArray, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { deleteFiles, storeFile, type StoredFile } from "../../../core/files";
import {
  IMPORT_EMPLOYEE_CHOICES_VERSION,
  IMPORT_EMPLOYEE_VERSION,
  type ImportEmployeeChoices,
  type ImportEmployeeRecord,
  type FileSource,
  type ImportSource,
  type IncomingRecord,
  type MappingOutcome,
  parseImportEmployeeChoices,
  parseImportEmployeeValues,
} from "../domain";
import { importChoices } from "./importChoicesTable";
import { deleteReplacedPhotos } from "./importPhotoRepository";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";

/** The import's sources and records, through the pool or inside a transaction. */
export interface ImportRepository {
  /** Creates the Slack source or renames it, marks it read now and returns its id. */
  saveSlackSource(name: string): Promise<string>;
  /** Stores an uploaded file as a source waiting for its first mapping run; returns its id. */
  insertFileSource(name: string, file: StoredFile): Promise<string>;
  /** The file source with this id, or null when there is none. */
  findFileSource(id: string): Promise<FileSource | null>;
  /**
   * Ends a mapping run, only while the source is still `mapping` at `attempt`; returns
   * whether it did. A late run, or one of a removed source, changes nothing.
   */
  finishMapping(id: string, attempt: number, outcome: MappingOutcome): Promise<boolean>;
  /** Starts the next mapping run of a failed file source; returns its attempt, or null. */
  restartMapping(id: string): Promise<number | null>;
  /** Deletes a file source, its records and its stored file. */
  deleteFileSource(id: string): Promise<void>;
  /** Whether any source is still being mapped. */
  hasMappingSource(): Promise<boolean>;
  /**
   * Waits for and holds, until the transaction ends, the lock that Approve and the
   * operations starting a mapping run take first, so Approve never misses a run.
   */
  lockSources(): Promise<void>;
  /**
   * Makes the source's employee records match `records` by external id: updates the
   * ones still there, so their ids stay, adds new ones and deletes the rest. Deletes the
   * photos whose link changed or whose record goes.
   */
  syncEmployeeRecords(sourceId: string, records: IncomingRecord[]): Promise<void>;
  /**
   * Deletes every source, record and choice, with the uploaded files and, unless `keepPhotos`,
   * the photos; kept photos are the employees' avatars after Approve.
   */
  deleteAll(options: { keepPhotos: boolean }): Promise<void>;
  listSources(): Promise<ImportSource[]>;
  findSources(ids: readonly string[]): Promise<ImportSource[]>;
  /** Every employee record of every source, oldest first. */
  listEmployeeRecords(): Promise<ImportEmployeeRecord[]>;
  /** The number of employee records of each source that has any; the others are absent. */
  countEmployees(sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** Up to `first + 1` of one source's employee records after `after`, oldest first; the extra one signals a next page. */
  findRecordPage(
    query: ImportRecordPageQuery,
  ): Promise<{ node: ImportEmployeeRecord; keyset: ImportRecordKeyset }[]>;
  /** What the owner settled for each group of records of `type`. */
  listChoices(type: "employee"): Promise<ImportEmployeeChoices[]>;
  /** Stores these choices, replacing any of the same keys. */
  saveChoices(type: "employee", choices: ImportEmployeeChoices[]): Promise<void>;
}

/** The id of the last record seen. */
export type ImportRecordKeyset = [id: string];

export interface ImportRecordPageQuery {
  sourceId: string;
  first: number;
  after: ImportRecordKeyset | null;
}

export function importRepository(db: Orm | Tx): ImportRepository {
  const orm = () => ormOf(db);

  return {
    saveSlackSource: async (name: string): Promise<string> => {
      const [row] = await orm()
        .insert(importSources)
        .values({ kind: "slack", name })
        .onConflictDoUpdate({
          target: importSources.kind,
          targetWhere: sql`${importSources.kind} = 'slack'`,
          set: { name, readAt: sql`now()` },
        })
        .returning({ id: importSources.id });
      return row!.id;
    },

    insertFileSource: async (name: string, file: StoredFile): Promise<string> => {
      const fileId = await storeFile(db, file);
      const [row] = await orm()
        .insert(importSources)
        .values({ kind: "file", name, fileId, status: "mapping" })
        .returning({ id: importSources.id });
      return row!.id;
    },

    findFileSource: async (id: string): Promise<FileSource | null> => {
      const [row] = await orm()
        .select({
          ...sourceColumns,
          fileId: importSources.fileId,
          mappingAttempt: importSources.mappingAttempt,
        })
        .from(importSources)
        .where(and(eq(importSources.id, id), eq(importSources.kind, "file")));
      return row ? { ...row, fileId: row.fileId! } : null;
    },

    finishMapping: async (
      id: string,
      attempt: number,
      outcome: MappingOutcome,
    ): Promise<boolean> => {
      const rows = await orm()
        .update(importSources)
        .set({
          status: outcome.status,
          failure: outcome.status === "failed" ? outcome.failure : null,
          failureMessage: outcome.status === "failed" ? (outcome.failureMessage ?? null) : null,
          readAt: sql`now()`,
        })
        .where(
          and(
            eq(importSources.id, id),
            eq(importSources.status, "mapping"),
            eq(importSources.mappingAttempt, attempt),
          ),
        )
        .returning({ id: importSources.id });
      return rows.length > 0;
    },

    restartMapping: async (id: string): Promise<number | null> => {
      const [row] = await orm()
        .update(importSources)
        .set({
          status: "mapping",
          failure: null,
          failureMessage: null,
          mappingAttempt: sql`${importSources.mappingAttempt} + 1`,
        })
        .where(
          and(
            eq(importSources.id, id),
            eq(importSources.kind, "file"),
            eq(importSources.status, "failed"),
          ),
        )
        .returning({ mappingAttempt: importSources.mappingAttempt });
      return row?.mappingAttempt ?? null;
    },

    deleteFileSource: async (id: string): Promise<void> => {
      const uploads = await orm()
        .delete(importSources)
        .where(and(eq(importSources.id, id), eq(importSources.kind, "file")))
        .returning({ fileId: importSources.fileId });
      await deleteFiles(db, presentIds(uploads));
    },

    hasMappingSource: async (): Promise<boolean> => {
      const [row] = await orm()
        .select({ id: importSources.id })
        .from(importSources)
        .where(eq(importSources.status, "mapping"))
        .limit(1);
      return row !== undefined;
    },

    lockSources: async (): Promise<void> => {
      await orm().execute(sql`select pg_advisory_xact_lock(hashtext(${SOURCES_LOCK_KEY}))`);
    },

    syncEmployeeRecords: async (sourceId: string, records: IncomingRecord[]): Promise<void> => {
      await deleteReplacedPhotos(db, sourceId, records);
      const ofSource = and(
        eq(importRecords.sourceId, sourceId),
        eq(importRecords.type, "employee"),
      )!;
      await orm()
        .delete(importRecords)
        .where(
          records.length === 0
            ? ofSource
            : and(
                ofSource,
                notInArray(
                  importRecords.externalId,
                  records.map(({ externalId }) => externalId),
                ),
              ),
        );
      for (let start = 0; start < records.length; start += INSERT_BATCH_SIZE) {
        await orm()
          .insert(importRecords)
          .values(
            records
              .slice(start, start + INSERT_BATCH_SIZE)
              .map(({ externalId, raw, values, photoUrl }) => ({
                sourceId,
                type: "employee" as const,
                typeVersion: IMPORT_EMPLOYEE_VERSION,
                externalId,
                raw,
                values,
                photoUrl: photoUrl ?? null,
              })),
          )
          .onConflictDoUpdate({
            target: [importRecords.sourceId, importRecords.type, importRecords.externalId],
            set: {
              typeVersion: sql`excluded.type_version`,
              raw: sql`excluded.raw`,
              values: sql`excluded.values`,
              photoUrl: sql`excluded.photo_url`,
              updatedAt: sql`now()`,
            },
          });
      }
    },

    deleteAll: async ({ keepPhotos }: { keepPhotos: boolean }): Promise<void> => {
      const photos = await orm()
        .delete(importRecords)
        .returning({ fileId: importRecords.photoFileId });
      const uploads = await orm().delete(importSources).returning({ fileId: importSources.fileId });
      await orm().delete(importChoices);
      await deleteFiles(db, [...(keepPhotos ? [] : presentIds(photos)), ...presentIds(uploads)]);
    },

    listSources: (): Promise<ImportSource[]> =>
      orm().select(sourceColumns).from(importSources).orderBy(importSources.createdAt),

    findSources: (ids: readonly string[]): Promise<ImportSource[]> =>
      orm()
        .select(sourceColumns)
        .from(importSources)
        .where(inArray(importSources.id, [...ids])),

    listEmployeeRecords: async (): Promise<ImportEmployeeRecord[]> => {
      const records = await orm()
        .select()
        .from(importRecords)
        .where(eq(importRecords.type, "employee"))
        .orderBy(importRecords.createdAt, importRecords.id);
      return records.map(toImportEmployee);
    },

    countEmployees: async (sourceIds: readonly string[]): Promise<Map<string, number>> => {
      const rows = await orm()
        .select({ sourceId: importRecords.sourceId, count: count() })
        .from(importRecords)
        .where(
          and(eq(importRecords.type, "employee"), inArray(importRecords.sourceId, [...sourceIds])),
        )
        .groupBy(importRecords.sourceId);
      return new Map(rows.map(({ sourceId, count }) => [sourceId, count]));
    },

    findRecordPage: async ({ sourceId, first, after }: ImportRecordPageQuery) => {
      const records = await orm()
        .select()
        .from(importRecords)
        .where(
          and(
            eq(importRecords.type, "employee"),
            eq(importRecords.sourceId, sourceId),
            after === null ? undefined : gt(importRecords.id, after[0]),
          ),
        )
        // uuidv7 ids follow the order the records were added in.
        .orderBy(importRecords.id)
        .limit(first + 1);
      return records.map((record) => ({ node: toImportEmployee(record), keyset: [record.id] }));
    },

    listChoices: async (type: "employee"): Promise<ImportEmployeeChoices[]> => {
      const rows = await orm().select().from(importChoices).where(eq(importChoices.type, type));
      return rows.map(({ key, leftOut, typeVersion, values }) => ({
        key,
        leftOut,
        values: parseImportEmployeeChoices(typeVersion, values),
      }));
    },

    saveChoices: async (type: "employee", choices: ImportEmployeeChoices[]): Promise<void> => {
      for (let start = 0; start < choices.length; start += INSERT_BATCH_SIZE) {
        await orm()
          .insert(importChoices)
          .values(
            choices.slice(start, start + INSERT_BATCH_SIZE).map(({ key, leftOut, values }) => ({
              type,
              typeVersion: IMPORT_EMPLOYEE_CHOICES_VERSION,
              key,
              leftOut,
              values,
            })),
          )
          .onConflictDoUpdate({
            target: [importChoices.type, importChoices.key],
            set: {
              typeVersion: sql`excluded.type_version`,
              leftOut: sql`excluded.left_out`,
              values: sql`excluded.values`,
              updatedAt: sql`now()`,
            },
          });
      }
    },
  };
}

const SOURCES_LOCK_KEY = "broccoli.import_sources";

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

const sourceColumns = {
  id: importSources.id,
  kind: importSources.kind,
  name: importSources.name,
  readAt: importSources.readAt,
  status: importSources.status,
  failure: importSources.failure,
  failureMessage: importSources.failureMessage,
};

function toImportEmployee(record: typeof importRecords.$inferSelect): ImportEmployeeRecord {
  return {
    id: record.id,
    sourceId: record.sourceId,
    ...parseImportEmployeeValues(record.typeVersion, record.values),
    photoFileId: record.photoFileId,
  };
}

function presentIds(rows: { fileId: string | null }[]): string[] {
  return rows.flatMap(({ fileId }) => (fileId ? [fileId] : []));
}
