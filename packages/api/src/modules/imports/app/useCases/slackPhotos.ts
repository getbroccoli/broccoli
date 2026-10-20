import type { Tx } from "../../../../core/db";
import { deleteFiles, storeFile } from "../../../../core/files";
import type { SecurityContext } from "../../../../core/security";
import { parseRasterImage, type RasterImage } from "../../../../utils";
import { importPhotoRepository } from "../../db";
import type { IncomingRecord } from "../../domain";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/** A downloaded photo for the member with this external id, not stored yet. */
export interface SlackPhoto {
  externalId: string;
  photoUrl: string;
  image: RasterImage;
}

/**
 * Downloads, before any transaction, the photos of the members whose photo is new,
 * changed or not stored yet; it starts no new round once the read that began at
 * `startedAt` has used its time budget, so the rest keep initials until the next read.
 */
export async function readSlackPhotos(
  context: ImportContext,
  ctx: SecurityContext,
  records: readonly IncomingRecord[],
  startedAt: Date,
): Promise<SlackPhoto[]> {
  requireImportAccess(ctx);
  const source = (await context.imports.listSources()).find(({ kind }) => kind === "slack");
  const links = source
    ? await importPhotoRepository(context.orm).listPhotoLinks(source.id)
    : new Map<string, string>();
  const downloads = records.flatMap(({ externalId, photoUrl }) =>
    photoUrl && links.get(externalId) !== photoUrl ? [{ externalId, photoUrl }] : [],
  );
  const photos: SlackPhoto[] = [];
  for (let start = 0; start < downloads.length; start += PARALLEL_DOWNLOADS) {
    if (context.clock().getTime() - startedAt.getTime() >= DOWNLOAD_BUDGET_MS) {
      break;
    }
    const round = downloads.slice(start, start + PARALLEL_DOWNLOADS);
    const images = await Promise.all(
      round.map(({ photoUrl }) => readPhoto(context, ctx, photoUrl)),
    );
    photos.push(
      ...round.flatMap((download, index) => {
        const image = images[index];
        return image ? [{ ...download, image }] : [];
      }),
    );
  }
  return photos;
}

/**
 * Stores the photos `readSlackPhotos` downloaded on the source's synced records, joining
 * `tx`; a record whose link changed in the meantime keeps no file.
 */
export async function attachSlackPhotos(
  tx: Tx,
  sourceId: string,
  photos: readonly SlackPhoto[],
): Promise<void> {
  const records = importPhotoRepository(tx);
  const waiting = new Map(
    (await records.findPhotoDownloads(sourceId)).map((download) => [download.externalId, download]),
  );
  for (const { externalId, photoUrl, image } of photos) {
    const record = waiting.get(externalId);
    if (record?.photoUrl !== photoUrl) {
      continue;
    }
    const fileId = await storeFile(tx, { content: image.bytes, mimeType: image.mimeType });
    if (!(await records.attachPhoto(record.recordId, photoUrl, fileId))) {
      await deleteFiles(tx, [fileId]);
    }
  }
}

const PARALLEL_DOWNLOADS = 16;
/** How long a Slack read keeps starting photo downloads; Refresh downloads the rest. */
const DOWNLOAD_BUDGET_MS = 20_000;
/** Far above a 192-pixel profile photo. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** The photo's image, or null; the log never carries the link, which may hold a token. */
async function readPhoto(
  { slack, logger }: ImportContext,
  ctx: SecurityContext,
  photoUrl: string,
): Promise<RasterImage | null> {
  try {
    const image = parseRasterImage(await slack.readSlackPhoto(ctx, new URL(photoUrl)), {
      maxBytes: MAX_PHOTO_BYTES,
    });
    if (!image) {
      logger.warn("A Slack photo is not an image");
    }
    return image;
  } catch (error) {
    logger.warn({ reason: (error as Error).name }, "Downloading a Slack photo failed");
    return null;
  }
}
