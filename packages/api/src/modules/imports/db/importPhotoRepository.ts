import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import { deleteFiles, storeFile, type StoredFile } from "../../../core/files";
import type { IncomingRecord } from "../domain";
import { importRecords } from "./importRecordsTable";

/** The photos of the import's records: which to download, attaching them and deleting them. */
export interface ImportPhotoRepository {
  /** The photo link of each of the source's records that has its photo, by external id. */
  listPhotoLinks(sourceId: string): Promise<Map<string, string>>;
  /** Every one of the source's records with a photo link but no photo. */
  findPhotoDownloads(sourceId: string): Promise<PhotoDownload[]>;
  /**
   * Stores the photo as the record's, only while the record still has no photo and its
   * link is still `photoUrl`; returns whether it did.
   */
  attachPhoto(recordId: string, photoUrl: string, photo: StoredFile): Promise<boolean>;
  /** Deletes every photo but `keptFileIds`, which Approve gave to employees. */
  deletePhotosExcept(keptFileIds: readonly string[]): Promise<void>;
  /** Whether a record's photo is this file. */
  hasPhoto(fileId: string): Promise<boolean>;
}

/** A record's photo still to download. */
export interface PhotoDownload {
  recordId: string;
  externalId: string;
  photoUrl: string;
}

export function importPhotoRepository(db: Orm | Tx): ImportPhotoRepository {
  const orm = () => ormOf(db);

  return {
    listPhotoLinks: async (sourceId: string): Promise<Map<string, string>> => {
      const rows = await orm()
        .select({ externalId: importRecords.externalId, photoUrl: importRecords.photoUrl })
        .from(importRecords)
        .where(and(eq(importRecords.sourceId, sourceId), isNotNull(importRecords.photoFileId)));
      return new Map(rows.map(({ externalId, photoUrl }) => [externalId, photoUrl!]));
    },

    findPhotoDownloads: (sourceId: string): Promise<PhotoDownload[]> =>
      orm()
        .select(photoDownloadColumns)
        .from(importRecords)
        .where(needsPhoto(sourceId))
        .then(toPhotoDownloads),

    attachPhoto: async (
      recordId: string,
      photoUrl: string,
      photo: StoredFile,
    ): Promise<boolean> => {
      const [waiting] = await orm()
        .select({ id: importRecords.id })
        .from(importRecords)
        .where(
          and(
            eq(importRecords.id, recordId),
            eq(importRecords.photoUrl, photoUrl),
            isNull(importRecords.photoFileId),
          ),
        )
        .for("update");
      if (!waiting) {
        return false;
      }
      const photoFileId = await storeFile(db, photo);
      await orm().update(importRecords).set({ photoFileId }).where(eq(importRecords.id, recordId));
      return true;
    },

    deletePhotosExcept: async (keptFileIds: readonly string[]): Promise<void> => {
      const kept = new Set(keptFileIds);
      const rows = await orm()
        .select({ fileId: importRecords.photoFileId })
        .from(importRecords)
        .where(isNotNull(importRecords.photoFileId));
      await deletePhotos(
        db,
        rows.map(({ fileId }) => fileId!).filter((id) => !kept.has(id)),
      );
    },

    hasPhoto: async (fileId: string): Promise<boolean> => {
      const rows = await orm()
        .select({ id: importRecords.id })
        .from(importRecords)
        .where(eq(importRecords.photoFileId, fileId))
        .limit(1);
      return rows.length > 0;
    },
  };
}

/**
 * Deletes the photos of the source's records whose link differs in `records`, or that
 * `records` leaves out; the sync of the source's records calls it first.
 */
export async function deleteReplacedPhotos(
  db: Orm | Tx,
  sourceId: string,
  records: readonly IncomingRecord[],
): Promise<void> {
  const incoming = new Map(records.map(({ externalId, photoUrl }) => [externalId, photoUrl]));
  const stored = await ormOf(db)
    .select({
      externalId: importRecords.externalId,
      photoUrl: importRecords.photoUrl,
      photoFileId: importRecords.photoFileId,
    })
    .from(importRecords)
    .where(and(eq(importRecords.sourceId, sourceId), isNotNull(importRecords.photoFileId)));
  await deletePhotos(
    db,
    stored
      .filter(({ externalId, photoUrl }) => (incoming.get(externalId) ?? null) !== photoUrl)
      .map(({ photoFileId }) => photoFileId!),
  );
}

/** Takes these photos off their records, then deletes their files. */
async function deletePhotos(db: Orm | Tx, fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) {
    return;
  }
  await ormOf(db)
    .update(importRecords)
    .set({ photoFileId: null })
    .where(inArray(importRecords.photoFileId, fileIds));
  await deleteFiles(db, fileIds);
}

const photoDownloadColumns = {
  recordId: importRecords.id,
  externalId: importRecords.externalId,
  photoUrl: importRecords.photoUrl,
};

/** Rows selected with `needsPhoto`, which only matches records with a photo link. */
function toPhotoDownloads(
  rows: { recordId: string; externalId: string; photoUrl: string | null }[],
): PhotoDownload[] {
  return rows.map((row) => ({ ...row, photoUrl: row.photoUrl! }));
}

function needsPhoto(sourceId: string) {
  return and(
    eq(importRecords.sourceId, sourceId),
    isNotNull(importRecords.photoUrl),
    isNull(importRecords.photoFileId),
  );
}
