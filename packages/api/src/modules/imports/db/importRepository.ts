import { isDeepStrictEqual } from "node:util";

import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";

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
import { importReviewChanges, type PreviousChoice } from "./importReviewChangesTable";
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
  /** Deletes a file source, its records and its stored file, and starts the review changes anew. */
  deleteFileSource(id: string): Promise<void>;
  /**
   * Makes the source's employee records match `records` by external id: updates the
   * ones still there, so their ids stay, adds new ones and deletes the rest. Deletes the
   * photos whose link changed or whose record goes. Starts the review changes anew, since Undo
   * must never put back choices made for other records.
   */
  syncEmployeeRecords(sourceId: string, records: IncomingRecord[]): Promise<void>;
  /**
   * Deletes every source, record and choice, with the uploaded files and, unless `keepPhotos`,
   * the photos; kept photos are the employees' avatars after Approve.
   */
  deleteAll(options: { keepPhotos: boolean }): Promise<void>;
  /**
   * Stores these choices, replacing any of the same keys, as one review change that
   * `undoReviewChange` reverses; choices that change nothing record nothing.
   */
  saveChoices(type: "employee", choices: ImportEmployeeChoices[]): Promise<void>;
  /**
   * Puts back the choices the review change `id` replaced and forgets it, only when it is the
   * latest one; returns whether it did.
   */
  undoReviewChange(id: string): Promise<boolean>;
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
      if (uploads.length > 0) {
        await orm().delete(importReviewChanges);
      }
      await deleteFiles(tx, presentIds(uploads));
    },

    syncEmployeeRecords: async (sourceId: string, records: IncomingRecord[]): Promise<void> => {
      await orm().delete(importReviewChanges);
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
      await orm().delete(importReviewChanges);
      await deleteFiles(tx, [...(keepPhotos ? [] : presentIds(photos)), ...presentIds(uploads)]);
    },

    saveChoices: async (type: "employee", choices: ImportEmployeeChoices[]): Promise<void> => {
      const stored = await readStoredChoices(
        tx,
        type,
        choices.map(({ key }) => key),
      );
      const changed = choices
        .map(({ key, leftOut, values }) => ({
          key,
          typeVersion: IMPORT_EMPLOYEE_CHOICES_VERSION,
          leftOut,
          values,
        }))
        // A key without a stored choice reads like one that settles nothing.
        .filter(
          (choice) =>
            !isDeepStrictEqual(
              stored.get(choice.key) ?? { ...choice, leftOut: false, values: {} },
              choice,
            ),
        );
      if (changed.length === 0) {
        return;
      }
      await orm()
        .insert(importReviewChanges)
        .values({
          type,
          previousChoices: changed.map(({ key }) => ({ key, choice: stored.get(key) ?? null })),
        });
      await writeChoices(tx, type, changed);
    },

    undoReviewChange: async (id: string): Promise<boolean> => {
      const [latest] = await orm()
        .select()
        .from(importReviewChanges)
        .orderBy(desc(importReviewChanges.id))
        .limit(1);
      if (latest?.id !== id) {
        return false;
      }
      const { previousChoices, type } = latest;
      const absentKeys = previousChoices.flatMap(({ key, choice }) => (choice ? [] : [key]));
      if (absentKeys.length > 0) {
        await orm()
          .delete(importChoices)
          .where(and(eq(importChoices.type, type), inArray(importChoices.key, absentKeys)));
      }
      await writeChoices(
        tx,
        type,
        previousChoices.flatMap(({ key, choice }) => (choice ? [{ key, ...choice }] : [])),
      );
      await orm().delete(importReviewChanges).where(eq(importReviewChanges.id, id));
      return true;
    },
  };
}

const IMPORT_LOCK_KEY = "broccoli.import_sources";

/** Rows per insert, well below Postgres's limit of 65,535 parameters. */
const INSERT_BATCH_SIZE = 1_000;

function presentIds(rows: { fileId: string | null }[]): string[] {
  return rows.flatMap(({ fileId }) => (fileId ? [fileId] : []));
}

type StoredChoice = { key: string } & NonNullable<PreviousChoice["choice"]>;

/** The stored choices of these keys, by key, as `writeChoices` writes them. */
async function readStoredChoices(
  tx: Tx,
  type: "employee",
  keys: string[],
): Promise<Map<string, StoredChoice>> {
  if (keys.length === 0) {
    return new Map();
  }
  const rows = await ormOf(tx)
    .select({
      key: importChoices.key,
      typeVersion: importChoices.typeVersion,
      leftOut: importChoices.leftOut,
      values: importChoices.values,
    })
    .from(importChoices)
    .where(and(eq(importChoices.type, type), inArray(importChoices.key, keys)));
  return new Map(rows.map((row) => [row.key, row]));
}

/** Stores these choices, replacing any of the same keys. */
async function writeChoices(tx: Tx, type: "employee", choices: StoredChoice[]): Promise<void> {
  for (let start = 0; start < choices.length; start += INSERT_BATCH_SIZE) {
    await ormOf(tx)
      .insert(importChoices)
      .values(
        choices.slice(start, start + INSERT_BATCH_SIZE).map((choice) => ({ type, ...choice })),
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
}
