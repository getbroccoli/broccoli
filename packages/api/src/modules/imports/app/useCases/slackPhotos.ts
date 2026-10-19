import type { Tx } from "../../../../core/db";
import { deleteFiles, storeFile } from "../../../../core/files";
import { isImportOpen } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { parseRasterImage, type RasterImage } from "../../../../utils";
import { importPhotoRepository, importRepository, type PhotoDownload } from "../../db";
import type { ImportContext } from "./importContext";
import { requireImportAccess } from "./requireImportAccess";

/** One run of the photo job: the source's records still missing a photo, by id after `after`. */
export interface SlackPhotoJob {
  sourceId: string;
  after: string | null;
}

declare module "../../../../core/jobs" {
  interface Jobs {
    "imports.downloadSlackPhotos": SlackPhotoJob;
  }
}

/**
 * Downloads the photos of the first records by name, which the owner waits for, and
 * queues the photo job for the rest.
 */
export async function downloadFirstSlackPhotos(
  context: ImportContext,
  ctx: SecurityContext,
  sourceId: string,
): Promise<void> {
  requireImportAccess(ctx);
  const downloads = await importPhotoRepository(context.orm).findPhotoDownloadsByName(
    sourceId,
    FIRST_PHOTOS,
  );
  const photos = await readPhotos(context, ctx, downloads);
  await context.transact(async (tx) => {
    if (!(await attachPhotos(tx, photos))) {
      return;
    }
    const [rest] = await importPhotoRepository(tx).findPhotoDownloadsAfter(sourceId, null, 1);
    if (rest) {
      await context.jobs.send(tx, "imports.downloadSlackPhotos", { sourceId, after: null });
    }
  });
}

/**
 * The photo job's run: downloads a batch of the source's records still missing a photo
 * and queues the next batch after it; tries each record once per run.
 */
export async function downloadSlackPhotos(
  context: ImportContext,
  ctx: SecurityContext,
  { sourceId, after }: SlackPhotoJob,
): Promise<void> {
  requireImportAccess(ctx);
  if (!(await isImportOpen(context.orm))) {
    return;
  }
  const downloads = await importPhotoRepository(context.orm).findPhotoDownloadsAfter(
    sourceId,
    after,
    JOB_BATCH,
  );
  const photos = await readPhotos(context, ctx, downloads);
  await context.transact(async (tx) => {
    if ((await attachPhotos(tx, photos)) && downloads.length === JOB_BATCH) {
      await context.jobs.send(tx, "imports.downloadSlackPhotos", {
        sourceId,
        after: downloads.at(-1)!.recordId,
      });
    }
  });
}

/** Photos the owner waits for during a Slack read. */
const FIRST_PHOTOS = 50;
/** Small enough for a job run to finish well within its time limit. */
const JOB_BATCH = 100;
const PARALLEL_DOWNLOADS = 8;
/** Far above a 512-pixel profile photo. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

interface DownloadedPhoto {
  download: PhotoDownload;
  image: RasterImage;
}

/** Downloads the photos a few at a time, before any transaction; a failed one is left out. */
async function readPhotos(
  context: ImportContext,
  ctx: SecurityContext,
  downloads: readonly PhotoDownload[],
): Promise<DownloadedPhoto[]> {
  const photos: DownloadedPhoto[] = [];
  for (let start = 0; start < downloads.length; start += PARALLEL_DOWNLOADS) {
    const batch = downloads.slice(start, start + PARALLEL_DOWNLOADS);
    const read = await Promise.all(batch.map((download) => readPhoto(context, ctx, download)));
    photos.push(...read.filter((photo) => photo !== null));
  }
  return photos;
}

async function readPhoto(
  { slack, logger }: ImportContext,
  ctx: SecurityContext,
  download: PhotoDownload,
): Promise<DownloadedPhoto | null> {
  try {
    const bytes = await slack.readSlackPhoto(ctx, new URL(download.photoUrl));
    const image = parseRasterImage(bytes, { maxBytes: MAX_PHOTO_BYTES });
    if (!image) {
      logger.warn({ recordId: download.recordId }, "A Slack photo is not an image");
    }
    return image && { download, image };
  } catch (error) {
    logger.warn({ err: error, recordId: download.recordId }, "Downloading a Slack photo failed");
    return null;
  }
}

/**
 * Stores each photo whose record still waits for it, while the import is open; returns
 * whether it was. A record that changed or went in the meantime keeps no file.
 */
async function attachPhotos(tx: Tx, photos: readonly DownloadedPhoto[]): Promise<boolean> {
  await importRepository(tx).lockSources();
  if (!(await isImportOpen(tx))) {
    return false;
  }
  const records = importPhotoRepository(tx);
  for (const { download, image } of photos) {
    const fileId = await storeFile(tx, { content: image.bytes, mimeType: image.mimeType });
    if (!(await records.attachPhoto(download.recordId, download.photoUrl, fileId))) {
      await deleteFiles(tx, [fileId]);
    }
  }
  return true;
}
