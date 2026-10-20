import type { SlackMember } from "../../../slack";
import {
  type ImportEmployeeValues,
  type IncomingRecord,
  nonBlank,
  parseEmail,
  splitFullName,
} from "../../domain";

/**
 * The workspace's people as employee records. Deleted members, bots, apps, guests and
 * members without a valid email are left out; a member listed twice counts once.
 */
export function mapSlackMembers(members: SlackMember[]): IncomingRecord[] {
  const records = new Map<string, IncomingRecord>();
  for (const member of members) {
    const email = parseEmail(member.profile?.email);
    if (records.has(member.id) || !isPerson(member) || email === null) {
      continue;
    }
    records.set(member.id, {
      externalId: member.id,
      raw: rawOf(member),
      values: {
        ...nameOf(member),
        email,
        jobTitle: nonBlank(member.profile?.title),
        startDate: null,
      },
      photoUrl: photoUrlOf(member),
    });
  }
  return [...records.values()];
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

/** Slack's own name fields; else the full name split at its last space. */
function nameOf(member: SlackMember): Pick<ImportEmployeeValues, "firstName" | "lastName"> {
  const firstName = nonBlank(member.profile?.first_name);
  const lastName = nonBlank(member.profile?.last_name);
  if (firstName && lastName) {
    return { firstName, lastName };
  }
  const fullName =
    nonBlank(member.profile?.real_name) ?? nonBlank(member.real_name) ?? nonBlank(member.name);
  if (fullName === null) {
    return { firstName, lastName };
  }
  return splitFullName(fullName);
}

/**
 * The link of the member's own photo: Slack generates a placeholder for members without
 * one, which shows as initials instead, and only Slack's photo hosts are ever asked.
 */
function photoUrlOf(member: SlackMember): string | null {
  const link = member.profile?.image_512;
  if (!member.profile?.is_custom_image || !link || !URL.canParse(link)) {
    return null;
  }
  const url = new URL(link);
  const onSlack = url.protocol === "https:" && url.hostname.endsWith(SLACK_PHOTO_HOST);
  return onSlack && !url.username && !url.password ? link : null;
}

/** Slack serves profile photos from its subdomains, such as `avatars.slack-edge.com`. */
const SLACK_PHOTO_HOST = ".slack-edge.com";

/** Only the fields the mapping reads: no phones or time zones are kept. */
function rawOf({ id, name, real_name, profile }: SlackMember) {
  return {
    id,
    name,
    real_name,
    profile: {
      first_name: profile?.first_name,
      last_name: profile?.last_name,
      real_name: profile?.real_name,
      display_name: profile?.display_name,
      email: profile?.email,
      title: profile?.title,
      image_512: profile?.image_512,
      is_custom_image: profile?.is_custom_image,
    },
  };
}
