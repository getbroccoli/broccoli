import { shortDate, versionOn } from "@/features/termsDisplay";
import { t } from "@/i18n";
import { addDays } from "@/lib/calendarDay";

/** Why "Applies from" can't be saved; null when it can. */
export function rulesDateError({
  startDate,
  earliest,
  before,
  balance,
}: {
  startDate: string;
  earliest: string;
  /** How the type counts the day before; null: not offered then. */
  before: string | null;
  /** How the type counts from `startDate`; null: not offered then. */
  balance: string | null;
}): string | null {
  if (!startDate || startDate < earliest) {
    return t("terms.edit.tooEarly", { date: shortDate(earliest) });
  }
  // The person's first day has nothing before it to count differently from.
  const startsYear = startDate.endsWith("-01-01") || startDate === earliest;
  return before && balance && before !== balance && !startsYear ? t("ownRules.countsDate") : null;
}

/** The person's rules on the day before `date`, from their versions from before it on; null without a date. */
export function rulesBefore<V extends { startDate: string; endDate?: string | null }>(
  versions: readonly V[],
  date: string,
): V | null {
  return date ? versionOn(versions, addDays(date, -1)) : null;
}
