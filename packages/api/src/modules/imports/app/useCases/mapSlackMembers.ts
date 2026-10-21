import type { SlackPerson } from "../../../slack";
import { type ImportEmployeeValues, type IncomingRecord, splitFullName } from "../../domain";
import { nonBlank, parseEmail } from "../../helpers";

/**
 * The workspace's people as employee records. People without a valid email are left out;
 * a member listed twice counts once.
 */
export function mapSlackMembers(members: readonly SlackPerson[]): IncomingRecord[] {
  const records = new Map<string, IncomingRecord>();
  for (const member of members) {
    const email = parseEmail(member.profile?.email);
    if (records.has(member.id) || email === null) {
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
      photoUrl: member.photo?.url ?? null,
    });
  }
  return [...records.values()];
}

/** Slack's own name fields; else the full name split at its last space. */
function nameOf(member: SlackPerson): Pick<ImportEmployeeValues, "firstName" | "lastName"> {
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

/** Only the fields the mapping reads: no phones or time zones are kept. */
function rawOf({ id, name, real_name, profile }: SlackPerson) {
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
      image_192: profile?.image_192,
      is_custom_image: profile?.is_custom_image,
    },
  };
}
