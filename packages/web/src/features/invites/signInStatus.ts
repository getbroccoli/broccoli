import type { SignInStatusFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A person's sign-in in words: the state, and for a pending invite its expiry or failed send. */
export function signInLabel(
  status: SignInStatusFragment,
  now: Date,
): { state: string; hint: string | null } {
  switch (status.state) {
    case "JOINED":
      return { state: t("invites.state.joined"), hint: null };
    case "NOT_INVITED":
      return { state: t("invites.state.notInvited"), hint: null };
    case "PENDING":
      return { state: t("invites.state.pending"), hint: pendingHint(status, now) };
  }
}

/**
 * The invite action a person's panel offers: Send invite, a quiet Resend while an invite is open,
 * or Resend invite when it was not sent or has expired. None for someone who cannot be invited.
 */
export function inviteAction(
  status: SignInStatusFragment,
  now: Date,
): { label: string; prominent: boolean } | null {
  if (!status.canBeInvited) return null;
  if (status.state === "NOT_INVITED") return { label: t("invites.action.send"), prominent: true };
  return isStale(status, now)
    ? { label: t("invites.action.resendStale"), prominent: true }
    : { label: t("invites.action.resend"), prominent: false };
}

/** How a sign-in reads at a glance: a failed or expired invite is a problem. */
export function signInTone(
  status: SignInStatusFragment,
  now: Date,
): "none" | "waiting" | "problem" | "joined" {
  switch (status.state) {
    case "JOINED":
      return "joined";
    case "NOT_INVITED":
      return "none";
    case "PENDING":
      return isStale(status, now) ? "problem" : "waiting";
  }
}

/** Who an invite reaches and who it skips, for the invite dialog. */
export function groupInvitees<Person extends { signInStatus?: SignInStatusFragment | null }>(
  people: readonly Person[],
): {
  invited: { person: Person; replacesLink: boolean }[];
  skipped: { person: Person; reason: SkipReason }[];
} {
  const invited: { person: Person; replacesLink: boolean }[] = [];
  const skipped: { person: Person; reason: SkipReason }[] = [];
  for (const person of people) {
    const status = person.signInStatus;
    if (status?.canBeInvited) invited.push({ person, replacesLink: status.state === "PENDING" });
    else skipped.push({ person, reason: skipReason(status) });
  }
  return { invited, skipped };
}

/** Why a person gets no invite. */
export type SkipReason = "joined" | "hasAccount" | "sampleData";

/** "2 November": the day an invite stops working. */
export function formatExpiryDay(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function pendingHint({ expiresAt, notSent }: SignInStatusFragment, now: Date): string | null {
  if (notSent) return t("invites.state.notSent");
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return t("invites.state.expired");
  if (days === 1) return t("invites.state.expiresWithinDay");
  return t("invites.state.expiresIn", { days: String(days) });
}

function isStale({ state, expiresAt, notSent }: SignInStatusFragment, now: Date): boolean {
  if (state !== "PENDING") return false;
  return notSent || (!!expiresAt && new Date(expiresAt).getTime() <= now.getTime());
}

function skipReason(status: SignInStatusFragment | null | undefined): SkipReason {
  if (status?.state === "JOINED") return "joined";
  return status?.emailHasAccount ? "hasAccount" : "sampleData";
}
