import { and, count, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { deleteFiles, storeFile, type StoredFile } from "../../../core/files";
import type { KeysetRow } from "../../../core/pagination";
import {
  IMPORT_EMPLOYEE_CHOICES_VERSION,
  IMPORT_EMPLOYEE_VERSION,
  type ImportEmployeeChoices,
  type ImportEmployeeRecord,
  type FileSource,
  type ImportSource,
  type ImportSourceReader,
  type IncomingRecord,
  type MappingOutcome,
  parseImportEmployeeChoices,
  parseImportEmployeeValues,
} from "../domain";
import { importChoices } from "./importChoicesTable";
import { deleteReplacedPhotos } from "./importPhotoRepository";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";

/** Reads the import's sources, records and choices, through the pool or joining a transaction. */
export interface ImportReader {
  listSources(): Promise<ImportSource[]>;
  findSources(ids: readonly string[]): Promise<ImportSource[]>;
  /** The file source with this id, or null when there is none. */
  findFileSource(id: string): Promise<FileSource | null>;
  /** Every employee record of every source, oldest first. */
  listEmployeeRecords(): Promise<ImportEmployeeRecord[]>;
  /** The number of employee records of each source that has any; the others are absent. */
  countEmployees(sourceIds: readonly string[]): Promise<Map<string, number>>;
  /** Up to `limit` of one source's employee records after the one with id `after`, oldest first. */
  findRecordPage(
    query: ImportRecordPageQuery,
  ): Promise<KeysetRow<ImportEmployeeRecord, [id: string]>[]>;
  /** What the owner settled for each group of records of `type`. */
  listChoices(type: "employee"): Promise<ImportEmployeeChoices[]>;
}

/** Reads and changes the import in a transaction that holds its lock (`lockImport`). */
export interface ImportRepository extends ImportReader {
  /** Creates the Slack source or renames it, marks it read now and returns its id. */
  saveSlackSource(name: string): Promise<string>;
  /**
   * Adds a file as a source and returns its id: an uploaded one, stored, waits to be mapped, by
   * Broccoli's first mapping run or by the external agent's answers; one the agent parsed, without
   * a stored file, is mapped at once.
   */
  insertFileSource(name: string, readBy: ImportSourceReader, file?: StoredFile): Promise<string>;
  /**
   * Ends a mapping run, only while the source is still `mapping` at `attempt`; returns
   * whether it did. A late run, or one of a removed source, changes nothing.
   */
  finishMapping(id: string, attempt: number, outcome: MappingOutcome): Promise<boolean>;
  /**
   * Starts Broccoli's next mapping run of a file it failed to map, or of a file still waiting for
   * the external agent's answers; returns its attempt, or null for any other source.
   */
  restartMapping(id: string): Promise<number | null>;
  /** Deletes a file source, its records and its stored file. */
  deleteFileSource(id: string): Promise<void>;
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
  /** Stores these choices, replacing any of the same keys. */
  saveChoices(type: "employee", choices: ImportEmployeeChoices[]): Promise<void>;
}

export interface ImportRecordPageQuery {
  sourceId: string;
  after: [id: string] | null;
  limit: number;
}

export function importReader(db: Orm | Tx): ImportReader {
  const orm = () => ormOf(db);

  return {
    listSources: (): Promise<ImportSource[]> =>
      orm().select(sourceColumns).from(importSources).orderBy(importSources.createdAt),

    findSources: (ids: readonly string[]): Promise<ImportSource[]> =>
      orm()
        .select(sourceColumns)
        .from(importSources)
        .where(inArray(importSources.id, [...ids])),

    findFileSource: async (id: string): Promise<FileSource | null> => {
      const [row] = await orm()
        .select({
          ...sourceColumns,
          fileId: importSources.fileId,
          mappingAttempt: importSources.mappingAttempt,
        })
        .from(importSources)
        .where(and(eq(importSources.id, id), eq(importSources.kind, "file")));
      return row ?? null;
    },

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

    findRecordPage: async ({ sourceId, after, limit }: ImportRecordPageQuery) => {
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
        .limit(limit);
      return records.map((record) => ({ node: toImportEmployee(record), values: [record.id] }));
    },

    listChoices: async (type: "employee"): Promise<ImportEmployeeChoices[]> => {
      const rows = await orm().select().from(importChoices).where(eq(importChoices.type, type));
      return rows.map(({ key, leftOut, typeVersion, values }) => ({
        key,
        leftOut,
        values: parseImportEmployeeChoices(typeVersion, values),
      }));
    },
  };
}

/**
 * Waits for and holds, until `tx` ends, the import's lock, which Approve and every change
 * take, and returns the repository that changes the import. A transaction that moves the
 * setup step moves it before this, so the instance row is always locked before the import.
 */
export async function lockImport(tx: Tx): Promise<ImportRepository> {
  await ormOf(tx).execute(sql`select pg_advisory_xact_lock(hashtext(${IMPORT_LOCK_KEY}))`);
  const orm = () => ormOf(tx);

  return {
    ...importReader(tx),

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

    insertFileSource: async (name, readBy, file): Promise<string> => {
      const fileId = file ? await storeFile(tx, file) : null;
      const status = readBy === "parsed_by_external_agent" ? "mapped" : "mapping";
      const [row] = await orm()
        .insert(importSources)
        .values({ kind: "file", name, readBy, fileId, status })
        .returning({ id: importSources.id });
      return row!.id;
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
          readBy: "parsed_by_broccoli",
          mappingAttempt: sql`${importSources.mappingAttempt} + 1`,
        })
        .where(
          and(
            eq(importSources.id, id),
            or(
              and(
                eq(importSources.readBy, "parsed_by_broccoli"),
                eq(importSources.status, "failed"),
              ),
              and(
                eq(importSources.readBy, "answered_by_external_agent"),
                eq(importSources.status, "mapping"),
              ),
            ),
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
      await deleteFiles(tx, presentIds(uploads));
    },

    syncEmployeeRecords: async (sourceId: string, records: IncomingRecord[]): Promise<void> => {
      await deleteReplacedPhotos(tx, sourceId, records);
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
      await deleteFiles(tx, [...(keepPhotos ? [] : presentIds(photos)), ...presentIds(uploads)]);
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

const IMPORT_LOCK_KEY = "broccoli.import_sources";

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
  readBy: importSources.readBy,
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
