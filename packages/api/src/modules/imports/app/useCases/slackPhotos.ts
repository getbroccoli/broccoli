import type { Orm, Tx } from "../../../../core/db";
import type { SlackPerson } from "../../../slack";
import { importPhotoRepository, importReader } from "../../db";

/** The link of each Slack record's stored photo, by Slack member id. */
export async function readStoredSlackPhotos(orm: Orm): Promise<Map<string, string>> {
  const source = (await importReader(orm).listSources()).find(({ kind }) => kind === "slack");
  return source ? importPhotoRepository(orm).listPhotoLinks(source.id) : new Map();
}

/**
 * Stores the photos Slack downloaded on the source's synced records, joining `tx`; a
 * record whose link changed in the meantime keeps no file.
 */
export async function attachSlackPhotos(
  tx: Tx,
  sourceId: string,
  members: readonly SlackPerson[],
): Promise<void> {
  const records = importPhotoRepository(tx);
  const waiting = new Map(
    (await records.findPhotoDownloads(sourceId)).map((download) => [download.externalId, download]),
  );
  for (const { id, photo } of members) {
    const record = waiting.get(id);
    if (!photo?.image || record?.photoUrl !== photo.url) {
      continue;
    }
    await records.attachPhoto(record.recordId, photo.url, {
      content: photo.image.bytes,
      mimeType: photo.image.mimeType,
    });
  }
}
