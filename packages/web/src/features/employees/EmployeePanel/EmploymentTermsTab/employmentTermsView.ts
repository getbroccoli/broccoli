import type { RuleSource } from "@/__generated__/graphql";
import { t } from "@/i18n";
import {
  calendarName,
  ruleSummary,
  type RuleText,
  shortDate,
  splitVersions,
  versionOn,
  type WeekMinutes,
  weekSummary,
} from "@/features/termsDisplay";
import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { calendarDayParts } from "@/lib/calendarDay";

/** One stretch of a person on one set of terms, as the panel reads it. */
export type TermsPeriod = {
  termsId: string;
  termsName: string;
  startDate?: string | null;
  endDate?: string | null;
};

/**
 * A person's terms around `today`: the ones covering it (null when none do, such as before they
 * start), the planned ones oldest first and the earlier ones newest first.
 */
export function termsPeriodsOn<P extends TermsPeriod>(
  periods: readonly P[],
  today: string,
): { current: P | null; planned: P[]; earlier: P[] } {
  const byStart = periods.toSorted((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  return {
    current: byStart.find((period) => covers(period, today)) ?? null,
    planned: byStart.filter(({ startDate }) => startDate != null && startDate > today),
    earlier: byStart.filter(({ endDate }) => endDate != null && endDate < today).reverse(),
  };
}

/**
 * Where a row comes from, as the reader sees it: an admin or manager reads the terms' name or the
 * person's name; the person reads "your".
 */
export function ruleSourceLabel(
  source: RuleSource,
  {
    termsName,
    viewerIsPerson,
    personFirstName,
  }: { termsName: string; viewerIsPerson: boolean; personFirstName: string },
): string {
  if (source === "THEIR_OWN") {
    return viewerIsPerson
      ? t("people.panel.terms.yourOwn")
      : t("people.panel.terms.theirOwn", { name: personFirstName });
  }
  return viewerIsPerson
    ? t("people.panel.terms.fromYourTerms")
    : t("people.panel.terms.fromTerms", { terms: termsName });
}

/** A dated version as the API sends it: today first, if any applies, then each later change. */
type DatedVersion = { source: RuleSource; startDate: string; endDate?: string | null };

/**
 * A row's value today and its planned lines from a person's versions: `describe` says what a
 * version is, `sourceOf` where it comes from, and `missing` what days nothing applies read as,
 * such as a type their next terms do not offer.
 */
export function rowOf<V extends DatedVersion>(
  versions: readonly V[],
  today: string,
  describe: (version: V) => { text: string; detail?: string },
  sourceOf: (version: V) => string,
  missing: string,
) {
  const { current, planned } = splitVersions(versions, today);
  const shown = current ? [current, ...planned] : planned;
  return {
    value: current && {
      ...describe(current),
      source: current.source,
      sourceLabel: sourceOf(current),
    },
    planned: shown.flatMap((version, index) => {
      const before = index === 0 ? null : shown[index - 1]!;
      const next = shown[index + 1];
      const line = (date: string, change: string) => ({
        text: t("people.panel.terms.planned", { date: shortDate(date), change }),
        startDate: date,
      });
      const starts =
        version === current
          ? []
          : [line(version.startDate, changeOf(version, before, describe, sourceOf))];
      const gapStart = version.endDate ? dayAfter(version.endDate) : null;
      // Nothing follows until a later version, if any: the type stops being offered.
      const stops = gapStart && next?.startDate !== gapStart ? [line(gapStart, missing)] : [];
      return [...starts, ...stops];
    }),
  };
}

/**
 * What a row changes to from `date` when moving the person, from their versions `before` and as
 * they would be `after`, both covering that date; null when it stays the same or they have their
 * own then.
 */
export function changeLineOn<V extends DatedVersion>(
  before: readonly V[],
  after: readonly V[],
  date: string,
  describe: (version: V) => { text: string; detail?: string },
  missing: string,
): string | null {
  const next = versionOn(after, date);
  if (next?.source === "THEIR_OWN") return null;
  const textOf = (version: V | null) => {
    if (!version) return missing;
    const { text, detail } = describe(version);
    return [text, detail].filter(Boolean).join(" · ");
  };
  const change = textOf(next);
  return change === textOf(versionOn(before, date))
    ? null
    : t("people.panel.terms.planned", { date: shortDate(date), change });
}

/** What a planned version changes to; where it comes from too when that changes, or it is their own. */
function changeOf<V extends DatedVersion>(
  version: V,
  before: V | null,
  describe: (version: V) => { text: string; detail?: string },
  sourceOf: (version: V) => string,
): string {
  const { text, detail } = describe(version);
  const source = version.source !== before?.source || version.source === "THEIR_OWN";
  return [text, detail, source && sourceOf(version)].filter(Boolean).join(" · ");
}

function dayAfter(day: string): string {
  const [year, month, date] = calendarDayParts(day);
  return new Date(Date.UTC(year, month, date + 1)).toISOString().slice(0, 10);
}

function covers({ startDate, endDate }: TermsPeriod, date: string): boolean {
  return (startDate ?? "") <= date && (endDate == null || endDate >= date);
}

/** A week as its row reads it: "Mon–Fri, 7.5 hours", then its bank holidays. */
export function describeWeek({
  week,
}: {
  week: WeekMinutes & { bankHolidayCalendar: BankHolidayCalendar };
}) {
  return {
    text: weekSummary(week),
    detail: t("people.panel.terms.bankHolidays", {
      calendar: calendarName(week.bankHolidayCalendar),
    }),
  };
}

/** A type's rules as its row reads them: "20 days a year, bank holidays on top", or recorded only. */
export function describeRules({ rules }: { rules: RuleText }) {
  return {
    text: rules.balance === "NO_BALANCE" ? t("terms.rule.recorded") : ruleSummary(rules),
  };
}
