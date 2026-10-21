import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";

import { ormOf, type Tx } from "../../../core/db";
import { deleteFiles, storeFile, type StoredFile } from "../../../core/files";
import {
  type ImportEmployeeChoices,
  type ImportSourceReader,
  type ImportSourceStatus,
  type IncomingRecord,
  type MappingOutcome,
} from "../domain";
import { IMPORT_EMPLOYEE_CHOICES_VERSION, IMPORT_EMPLOYEE_VERSION } from "./importEmployeeJson";
import { importChoices } from "./importChoicesTable";
import { deleteReplacedPhotos } from "./importPhotoRepository";
import { importRecords } from "./importRecordsTable";
import { importSources } from "./importSourcesTable";
import { importReader, type ImportReader } from "./importReader";

/** Reads and changes the import in a transaction that holds its lock (`lockImport`). */
export interface ImportRepository extends ImportReader {
  /** Creates the Slack source or renames it, marks it read now and returns its id. */
  saveSlackSource(name: string): Promise<string>;
  /**
   * Stores an uploaded file as a source waiting to be mapped, by Broccoli's first mapping run or
   * by the external agent's answers, or, for a PDF, waiting for the owner's consent; returns its id.
   */
  insertFileSource(
    name: string,
    readBy: ImportSourceReader,
    file: StoredFile,
    status: Extract<ImportSourceStatus, "mapping" | "waiting_for_original_read_consent">,
  ): Promise<string>;
  /**
   * Ends a mapping run, only while the source is still `mapping` at `attempt`; returns
   * whether it did. A late run, or one of a removed source, changes nothing.
   */
  finishMapping(id: string, attempt: number, outcome: MappingOutcome): Promise<boolean>;
  /**
   * Starts Broccoli's next mapping run of a file it failed to map, or of a file still waiting for
   * the external agent's answers; returns its attempt, or null for any other source, such as one
   * the owner let AI read in full.
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

    insertFileSource: async (name, readBy, file, status): Promise<string> => {
      const fileId = await storeFile(tx, file);
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
            isNull(importSources.originalReadAllowedAt),
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

function presentIds(rows: { fileId: string | null }[]): string[] {
  return rows.flatMap(({ fileId }) => (fileId ? [fileId] : []));
}
