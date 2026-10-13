import { z } from "zod";

import type { ImportEmployeeValues, IncomingRecord } from "./importEmployee";

/** The fields of a Slack member the import reads. */
export interface SlackMember {
  id: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_app_user?: boolean;
  is_restricted?: boolean;
  is_ultra_restricted?: boolean;
  profile?: {
    first_name?: string;
    last_name?: string;
    real_name?: string;
    display_name?: string;
    email?: string;
    title?: string;
  };
}

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

const email = z.email();

function parseEmail(raw: string | undefined): string | null {
  const normalised = raw?.trim().toLowerCase() ?? "";
  return email.safeParse(normalised).success ? normalised : null;
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
  const lastSpace = fullName.lastIndexOf(" ");
  return lastSpace === -1
    ? { firstName: fullName, lastName: null }
    : { firstName: fullName.slice(0, lastSpace).trim(), lastName: fullName.slice(lastSpace + 1) };
}

function nonBlank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Only the fields the mapping reads: no avatars, phones or time zones are kept. */
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
    },
  };
}
