import { createHash, randomBytes } from "node:crypto";

import { ApplicationError, invalidInput } from "../../../core/applicationError";
import { parseGivenProfiles, type PermissionProfile } from "../../../core/security";
import { parseUuid } from "../../../utils";

/** How long an invite link works. */
export const INVITE_DAYS = 7;

/** The most people one call invites. */
export const MAX_INVITEES = 1_000;

/** The longest note an invite carries. */
export const NOTE_MAX_LENGTH = 1_000;

/** Whether a note holds a link, which Broccoli's relay refuses outside the instance's origin. */
export function noteHasLink(note: string): boolean {
  return /https?:\/\/|www\./i.test(note);
}

/** How the person gets their invite: by email, or as a link the admin copies and sends. */
export type InviteDelivery = "sent_by_email" | "copied_by_owner";

/** Whether a person can sign in: no open invite, an invite not accepted yet, or a linked user. */
export type SignInState = "not_invited" | "pending" | "joined";

/** A person's sign-in state, and what an admin needs to know about their invite. */
export interface SignInStatus {
  state: SignInState;
  /** When the pending invite stops working; null without one. */
  expiresAt: Date | null;
  /** Whether sending the pending invite's email failed. */
  notSent: boolean;
  /** Whether the person's email already belongs to an account, so they cannot be invited. */
  emailHasAccount: boolean;
  /** Whether an invite can be sent: not joined, not demo data, and no account has their email. */
  canBeInvited: boolean;
}

/** An admin's offer to one person to sign in, by a single-use link. */
export interface Invite {
  id: string;
  employeeId: string;
  /** The employee's email when invited, lowercased; the user is created with it. */
  email: string;
  /** The SHA-256 of the token in the link; the token itself is never stored. */
  tokenHash: string;
  /** The profiles the person gets beside `EMPLOYEE`. */
  profiles: "ADMIN"[];
  note: string | null;
  /** Null once the inviter's user is deleted. */
  invitedByUserId: string | null;
  createdAt: Date;
  expiresAt: Date;
  sendFailedAt: Date | null;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  replacedAt: Date | null;
}

/** The secret in an invite link, 256 random bits, and the hash stored for it. */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The link that opens the invite page; the token is in the fragment, so no server or `Referer` sees it. */
export function inviteLink(origin: string, token: string): string {
  return `${origin}/invite#${token}`;
}

/** When an invite made at `now` stops working. */
export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

/** Whether a person can get an invite: not joined, not demo data, and no account has their email. */
export function canBeInvited({
  employee,
  isDemo,
  emailHasAccount,
}: {
  employee: { userId: string | null };
  isDemo: boolean;
  emailHasAccount: boolean;
}): boolean {
  return !employee.userId && !isDemo && !emailHasAccount;
}

/** Not accepted, cancelled or replaced; an expired invite stays open. */
export function isOpen(invite: Invite): boolean {
  return !invite.acceptedAt && !invite.cancelledAt && !invite.replacedAt;
}

/**
 * Whether the person can join with this open invite: it has not expired, they can still be
 * invited, and their email is still the one it was sent to, which their account gets.
 */
export function canAccept(
  invite: Invite,
  invitee: {
    employee: { userId: string | null; email: string };
    isDemo: boolean;
    emailHasAccount: boolean;
  },
): boolean {
  return (
    !isExpired(invite) &&
    canBeInvited(invitee) &&
    invitee.employee.email.toLowerCase() === invite.email
  );
}

/** Whether the invite's link stopped working with time. */
export function isExpired(invite: Invite): boolean {
  return invite.expiresAt.getTime() <= Date.now();
}

/** A person's sign-in state from whether they joined and their open invite. */
export function signInStatus(
  invitee: { employee: { userId: string | null }; isDemo: boolean; emailHasAccount: boolean },
  open: Invite | undefined,
): SignInStatus {
  const { emailHasAccount } = invitee;
  const known = { emailHasAccount, canBeInvited: canBeInvited(invitee) };
  if (invitee.employee.userId) {
    return { state: "joined", expiresAt: null, notSent: false, ...known };
  }
  return open
    ? { state: "pending", expiresAt: open.expiresAt, notSent: !!open.sendFailedAt, ...known }
    : { state: "not_invited", expiresAt: null, notSent: false, ...known };
}

/** The input of a send as the service uses it: canonical ids, each once, the profiles to give and the note. */
export function parseInviteInput({
  employeeIds,
  profiles,
  note,
}: {
  employeeIds: readonly string[];
  profiles?: readonly PermissionProfile[] | null;
  note?: string | null;
}) {
  const parsedIds = employeeIds.map(parseUuid);
  if (parsedIds.some((id) => id === null)) {
    throw new ApplicationError("NOT_FOUND", "No employee has this id.");
  }
  // Parsed first, so one id in two cases counts once.
  const ids = [...new Set(parsedIds as string[])];
  if (ids.length === 0) {
    throw invalidInput([{ field: "employeeIds", code: "required" }]);
  }
  if (ids.length > MAX_INVITEES) {
    throw invalidInput([{ field: "employeeIds", code: "too_many" }]);
  }
  const trimmedNote = note?.trim() || null;
  if (trimmedNote && trimmedNote.length > NOTE_MAX_LENGTH) {
    throw invalidInput([{ field: "note", code: "too_long" }]);
  }
  return {
    employeeIds: ids,
    profiles: profiles ? parseGivenProfiles(profiles) : null,
    note: trimmedNote,
  };
}
