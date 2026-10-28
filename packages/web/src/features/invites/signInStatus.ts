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

function skipReason(status: SignInStatusFragment | null | undefined): SkipReason {
  if (status?.state === "JOINED") return "joined";
  return status?.emailHasAccount ? "hasAccount" : "sampleData";
}
