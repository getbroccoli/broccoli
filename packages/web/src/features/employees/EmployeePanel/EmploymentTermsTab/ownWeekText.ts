import type { RuleSource } from "@/__generated__/graphql";
import { shortDate, splitVersions } from "@/features/termsDisplay";
import { t } from "@/i18n";
import { addDays } from "@/lib/calendarDay";

/** What saving an own week does: gives or changes it, and the allowance follows from a date that has come. */
export function ownWeekSaveLine({
  firstName,
  startDate,
  today,
  alreadyOwn,
}: {
  firstName: string;
  startDate: string;
  today: string;
  /** They have their own week on that date already. */
  alreadyOwn: boolean;
}): string {
  const values = { name: firstName, date: shortDate(startDate) };
  return withAllowance(
    t(alreadyOwn ? "ownWeek.saveChanges" : "ownWeek.saveGives", values),
    firstName,
    startDate,
    today,
  );
}

/** What saving a return to the terms' week does. */
export function termsWeekSaveLine({
  firstName,
  termsName,
  startDate,
  today,
}: {
  firstName: string;
  termsName: string;
  startDate: string;
  today: string;
}): string {
  const values = { name: firstName, terms: termsName, date: shortDate(startDate) };
  return withAllowance(t("ownWeek.saveBack", values), firstName, startDate, today);
}

/** "Sam’s own working week saved." */
export function ownWeekSavedToast(firstName: string): string {
  return t("ownWeek.saved", { name: firstName });
}

/** "Sam is back on England and Wales’s week from 1 Sep 2027." */
export function termsWeekSavedToast({
  firstName,
  termsName,
  startDate,
}: {
  firstName: string;
  termsName: string;
  startDate: string;
}): string {
  return t("ownWeek.back", { name: firstName, terms: termsName, date: shortDate(startDate) });
}

/**
 * The start dates of planned changes the person's own week or rules make, which Cancel change can
 * remove: a planned own version, and a planned return after one, also to nothing where the terms
 * offer no rules. A change the terms plan is theirs.
 */
export function cancellableStarts(
  versions: readonly { source: RuleSource; startDate: string; endDate?: string | null }[],
  today: string,
): string[] {
  const { current, planned } = splitVersions(versions, today);
  const shown = current ? [current, ...planned] : planned;
  return shown.flatMap((version, index) => {
    const before = shown[index - 1];
    const next = shown[index + 1];
    const followsOwn = before?.source === "THEIR_OWN" && endsDayBefore(before, version.startDate);
    const starts =
      version !== current && (version.source === "THEIR_OWN" || followsOwn)
        ? [version.startDate]
        : [];
    const returnsToNothing =
      version.source === "THEIR_OWN" &&
      version.endDate != null &&
      !(next && endsDayBefore(version, next.startDate));
    return returnsToNothing ? [...starts, addDays(version.endDate!, 1)] : starts;
  });
}

/** The week or rules a row's actions start from: today's, or the first for a person not started yet. */
export function versionToEditFrom<Version extends { startDate: string; endDate?: string | null }>(
  versions: readonly Version[],
  today: string,
): Version | null {
  const { current, planned } = splitVersions(versions, today);
  return current ?? planned[0] ?? null;
}

/** The save line, with the allowance sentence when the change applies from today or earlier. */
export function withAllowance(
  line: string,
  firstName: string,
  startDate: string,
  today: string,
): string {
  return startDate <= today ? `${line} ${t("changeTerms.reworked", { name: firstName })}` : line;
}

function endsDayBefore(version: { endDate?: string | null }, date: string): boolean {
  return version.endDate != null && addDays(version.endDate, 1) === date;
}
