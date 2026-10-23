import type { Logger } from "../../../../core/logger";
import type { SlackApi, SlackMember } from "../../../../integrations/slack";
import { normalizeImage, type RasterImage } from "../../../../utils";

/** A person of the workspace as Slack lists them, with their own photo, or null for none. */
export type SlackPerson = SlackMember & { photo: SlackPhoto | null };

export interface SlackPhoto {
  url: string;
  /**
   * The photo fitted in 256 × 256 as WebP; null when the caller already has it, the
   * download failed, or the read's time budget ran out, so the next read tries again.
   */
  image: RasterImage | null;
}

/** What downloading the photos of one read needs. */
export interface PhotoDownloads {
  slackApi: SlackApi;
  logger: Logger;
  clock: () => Date;
  /** When the read started; its time budget counts from then. */
  startedAt: Date;
  /** The photo link the caller already has of each member, by member id. */
  knownPhotos: ReadonlyMap<string, string>;
}

/**
 * The workspace's people, leaving out deleted members, bots, apps and guests, with the
 * photos the caller does not have yet, downloaded within the read's time budget.
 */
export async function readSlackPeople(
  members: readonly SlackMember[],
  downloads: PhotoDownloads,
): Promise<SlackPerson[]> {
  const people = members
    .filter(isPerson)
    .map((member) => ({ member, photoUrl: photoUrlOf(member) }));
  const images = await downloadPhotos(
    people.flatMap(({ member, photoUrl }, index) => {
      const slackMemberId = member.id;
      if (photoUrl === null) {
        downloads.logger.info(
          {
            slackMemberId,
            reason: member.profile?.is_custom_image ? "invalid_photo_url" : "no_custom_photo",
          },
          "Skipped a Slack photo",
        );
        return [];
      }
      if (downloads.knownPhotos.get(slackMemberId) === photoUrl) {
        downloads.logger.info({ slackMemberId }, "Kept a stored Slack photo");
        return [];
      }
      return [{ index, slackMemberId, url: photoUrl }];
    }),
    downloads,
  );
  return people.map(({ member, photoUrl }, index) => ({
    ...member,
    photo: photoUrl === null ? null : { url: photoUrl, image: images.get(index) ?? null },
  }));
}

function isPerson(member: SlackMember): boolean {
  return !(
    member.deleted ||
    member.is_bot ||
    member.is_app_user ||
    member.is_restricted ||
    member.is_ultra_restricted
  );
}

/**
 * The link of the member's own photo: Slack generates a placeholder for members without
 * one, which shows as initials instead, and only Slack's photo hosts are ever asked.
 */
function photoUrlOf(member: SlackMember): string | null {
  const link = member.profile?.image_192;
  if (!member.profile?.is_custom_image || !link || !URL.canParse(link)) {
    return null;
  }
  const url = new URL(link);
  const onSlack = url.protocol === "https:" && url.hostname.endsWith(SLACK_PHOTO_HOST);
  return onSlack && !url.username && !url.password ? link : null;
}

/** Slack serves profile photos from its subdomains, such as `avatars.slack-edge.com`. */
const SLACK_PHOTO_HOST = ".slack-edge.com";

const PARALLEL_DOWNLOADS = 16;
/** How long a read keeps starting photo downloads; the next read downloads the rest. */
const DOWNLOAD_BUDGET_MS = 20_000;
/** Far above a 192-pixel profile photo. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/**
 * The downloaded images by the index of the person they belong to, as Slack may list a
 * member twice; starts no new round once the budget is used.
 */
async function downloadPhotos(
  photos: readonly { index: number; slackMemberId: string; url: string }[],
  downloads: PhotoDownloads,
): Promise<Map<number, RasterImage>> {
  const images = new Map<number, RasterImage>();
  for (let start = 0; start < photos.length; start += PARALLEL_DOWNLOADS) {
    if (downloads.clock().getTime() - downloads.startedAt.getTime() >= DOWNLOAD_BUDGET_MS) {
      for (const { slackMemberId } of photos.slice(start)) {
        downloads.logger.info(
          { slackMemberId, reason: "download_budget_exhausted" },
          "Deferred a Slack photo",
        );
      }
      break;
    }
    const round = photos.slice(start, start + PARALLEL_DOWNLOADS);
    const roundImages = await Promise.all(round.map((photo) => downloadPhoto(downloads, photo)));
    round.forEach(({ index }, position) => {
      const image = roundImages[position];
      if (image) {
        images.set(index, image);
      }
    });
  }
  return images;
}

/** The photo's image, or null; the log never carries the link, which may hold a token. */
async function downloadPhoto(
  { slackApi, logger }: PhotoDownloads,
  { url, slackMemberId }: { url: string; slackMemberId: string },
): Promise<RasterImage | null> {
  try {
    const image = await normalizeImage(await slackApi.readPhoto(new URL(url)), {
      maxBytes: MAX_PHOTO_BYTES,
    });
    if (!image) {
      logger.warn({ slackMemberId }, "A Slack photo is not an image");
    } else {
      logger.info({ slackMemberId }, "Downloaded a Slack photo");
    }
    return image;
  } catch (error) {
    logger.warn(
      { slackMemberId, reason: (error as Error).name },
      "Downloading a Slack photo failed",
    );
    return null;
  }
}
