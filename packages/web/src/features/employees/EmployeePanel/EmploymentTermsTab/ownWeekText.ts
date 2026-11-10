import type { RuleSource } from "@/__generated__/graphql";
import { shortDate, splitVersions } from "@/features/termsDisplay";
import { t } from "@/i18n";

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
 * The start dates of planned week changes the person's own week makes, which Cancel change can
 * remove: a planned own week, and a planned return after one. A change the terms plan is theirs.
 */
export function cancellableStarts(
  versions: readonly { source: RuleSource; startDate: string; endDate?: string | null }[],
  today: string,
): string[] {
  const { current, planned } = splitVersions(versions, today);
  return planned.flatMap((version, index) => {
    const before = index === 0 ? current : planned[index - 1];
    return version.source === "THEIR_OWN" || before?.source === "THEIR_OWN"
      ? [version.startDate]
      : [];
  });
}

/** The week the row's actions start from: today's, or the first one for a person not started yet. */
export function weekToEditFrom<Version extends { startDate: string; endDate?: string | null }>(
  versions: readonly Version[],
  today: string,
): Version | null {
  const { current, planned } = splitVersions(versions, today);
  return current ?? planned[0] ?? null;
}

function withAllowance(line: string, firstName: string, startDate: string, today: string): string {
  return startDate <= today ? `${line} ${t("changeTerms.reworked", { name: firstName })}` : line;
}
