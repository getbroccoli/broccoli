import type { Tx } from "../../../../core/db";
import { deleteFiles, storeFile } from "../../../../core/files";
import { isImportOpen } from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { parseRasterImage, type RasterImage } from "../../../../utils";
import { importPhotoRepository, importRepository, type PhotoDownload } from "../../db";
import { type IncomingRecord, nameSortKey } from "../../domain";
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

/** A downloaded photo for the member with this external id, not stored yet. */
export interface SlackPhoto {
  externalId: string;
  photoUrl: string;
  image: RasterImage;
}

/**
 * Downloads, before any transaction, the photos of the first members by name, as review
 * lists them, whose photo is new or changed; the owner waits for these.
 */
export async function readFirstSlackPhotos(
  context: ImportContext,
  ctx: SecurityContext,
  records: readonly IncomingRecord[],
): Promise<SlackPhoto[]> {
  requireImportAccess(ctx);
  const source = (await context.imports.listSources()).find(({ kind }) => kind === "slack");
  const links = source
    ? await importPhotoRepository(context.orm).listPhotoLinks(source.id)
    : new Map<string, string>();
  const first = records
    .filter(({ externalId, photoUrl }) => photoUrl && links.get(externalId) !== photoUrl)
    .toSorted(byName)
    .slice(0, FIRST_PHOTOS);
  return readPhotos(
    context,
    ctx,
    first.map(({ externalId, photoUrl }) => ({ externalId, photoUrl: photoUrl! })),
  );
}

/**
 * Stores the photos `readFirstSlackPhotos` downloaded for the source's synced records,
 * joining `tx`, and queues the photo job when records still need one.
 */
export async function attachFirstSlackPhotos(
  context: ImportContext,
  tx: Tx,
  sourceId: string,
  photos: readonly SlackPhoto[],
): Promise<void> {
  const waiting = await importPhotoRepository(tx).findPhotoDownloads(sourceId);
  const downloaded = new Map(photos.map((photo) => [photo.externalId, photo]));
  const attachable = waiting.flatMap((download) => {
    const photo = downloaded.get(download.externalId);
    return photo?.photoUrl === download.photoUrl ? [{ ...download, image: photo.image }] : [];
  });
  await storePhotos(tx, attachable);
  if (waiting.length > attachable.length) {
    await context.jobs.send(tx, "imports.downloadSlackPhotos", { sourceId, after: null });
  }
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
    await importRepository(tx).lockSources();
    if (!(await isImportOpen(tx))) {
      return;
    }
    await storePhotos(tx, photos);
    if (downloads.length === JOB_BATCH) {
      await context.jobs.send(tx, "imports.downloadSlackPhotos", {
        sourceId,
        after: downloads.at(-1)!.recordId,
      });
    }
  });
}

/** Photos the owner waits for during a Slack read. */
const FIRST_PHOTOS = 50;
/** Five rounds of downloads at their 10-second limit, well within a job's 2 minutes. */
const JOB_BATCH = 40;
const PARALLEL_DOWNLOADS = 8;
/** Far above a 512-pixel profile photo. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Review's default order: by name, the email breaking ties. */
function byName(a: IncomingRecord, b: IncomingRecord): number {
  const first = nameKeyOf(a);
  const second = nameKeyOf(b);
  return first.map((value, index) => value.localeCompare(second[index]!)).find(Boolean) ?? 0;
}

function nameKeyOf({ externalId, values }: IncomingRecord): string[] {
  return nameSortKey(values.firstName, values.lastName, values.email ?? externalId);
}

/** Downloads the photos a few at a time, before any transaction; a failed one is left out. */
async function readPhotos<Download extends { photoUrl: string }>(
  context: ImportContext,
  ctx: SecurityContext,
  downloads: readonly Download[],
): Promise<(Download & { image: RasterImage })[]> {
  const photos: (Download & { image: RasterImage })[] = [];
  for (let start = 0; start < downloads.length; start += PARALLEL_DOWNLOADS) {
    const batch = downloads.slice(start, start + PARALLEL_DOWNLOADS);
    const images = await Promise.all(
      batch.map(({ photoUrl }) => readPhoto(context, ctx, photoUrl)),
    );
    photos.push(
      ...batch.flatMap((download, index) => {
        const image = images[index];
        return image ? [{ ...download, image }] : [];
      }),
    );
  }
  return photos;
}

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

/** Stores each photo whose record still waits for it; a record that changed in the meantime keeps no file. */
async function storePhotos(
  tx: Tx,
  photos: readonly (PhotoDownload & { image: RasterImage })[],
): Promise<void> {
  const records = importPhotoRepository(tx);
  for (const { recordId, photoUrl, image } of photos) {
    const fileId = await storeFile(tx, { content: image.bytes, mimeType: image.mimeType });
    if (!(await records.attachPhoto(recordId, photoUrl, fileId))) {
      await deleteFiles(tx, [fileId]);
    }
  }
}
