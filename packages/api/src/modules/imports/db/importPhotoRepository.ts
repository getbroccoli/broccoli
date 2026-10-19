import { and, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";

import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { IncomingRecord } from "../domain";
import { importRecords } from "./importRecordsTable";

/** The photos of the import's records: which to download, and attaching them. */
export interface ImportPhotoRepository {
  /** The photo link of each of the source's records that has its photo, by external id. */
  listPhotoLinks(sourceId: string): Promise<Map<string, string>>;
  /** Every one of the source's records with a photo link but no photo. */
  findPhotoDownloads(sourceId: string): Promise<PhotoDownload[]>;
  /** Up to `first` of the source's records with a photo link but no photo, by id after `after`. */
  findPhotoDownloadsAfter(
    sourceId: string,
    after: string | null,
    first: number,
  ): Promise<PhotoDownload[]>;
  /**
   * Makes the file the record's photo, only while the record still has no photo and its
   * link is still `photoUrl`; returns whether it did.
   */
  attachPhoto(recordId: string, photoUrl: string, fileId: string): Promise<boolean>;
  /**
   * Takes the photo off the source's records whose link differs in `records`, or that
   * `records` leaves out; returns those photo files.
   */
  detachReplacedPhotos(sourceId: string, records: readonly IncomingRecord[]): Promise<string[]>;
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

    findPhotoDownloadsAfter: (
      sourceId: string,
      after: string | null,
      first: number,
    ): Promise<PhotoDownload[]> =>
      orm()
        .select(photoDownloadColumns)
        .from(importRecords)
        .where(and(needsPhoto(sourceId), after === null ? undefined : gt(importRecords.id, after)))
        .orderBy(importRecords.id)
        .limit(first)
        .then(toPhotoDownloads),

    attachPhoto: async (recordId: string, photoUrl: string, fileId: string): Promise<boolean> => {
      const rows = await orm()
        .update(importRecords)
        .set({ photoFileId: fileId })
        .where(
          and(
            eq(importRecords.id, recordId),
            eq(importRecords.photoUrl, photoUrl),
            isNull(importRecords.photoFileId),
          ),
        )
        .returning({ id: importRecords.id });
      return rows.length > 0;
    },

    detachReplacedPhotos: async (
      sourceId: string,
      records: readonly IncomingRecord[],
    ): Promise<string[]> => {
      const incoming = new Map(records.map(({ externalId, photoUrl }) => [externalId, photoUrl]));
      const stored = await orm()
        .select({
          id: importRecords.id,
          externalId: importRecords.externalId,
          photoUrl: importRecords.photoUrl,
          photoFileId: importRecords.photoFileId,
        })
        .from(importRecords)
        .where(and(eq(importRecords.sourceId, sourceId), isNotNull(importRecords.photoFileId)));
      const replaced = stored.filter(
        ({ externalId, photoUrl }) => (incoming.get(externalId) ?? null) !== photoUrl,
      );
      if (replaced.length > 0) {
        await orm()
          .update(importRecords)
          .set({ photoFileId: null })
          .where(
            inArray(
              importRecords.id,
              replaced.map(({ id }) => id),
            ),
          );
      }
      return replaced.map(({ photoFileId }) => photoFileId!);
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
