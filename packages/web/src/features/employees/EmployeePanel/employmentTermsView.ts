import type { RuleSource } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { shortDate, splitVersions } from "@/features/termsDisplay";

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
 * version is, `sourceOf` where it comes from.
 */
export function rowOf<V extends DatedVersion>(
  versions: readonly V[],
  today: string,
  describe: (version: V) => { text: string; detail?: string },
  sourceOf: (version: V) => string,
) {
  const { current, planned } = splitVersions(versions, today);
  return {
    value: current && {
      ...describe(current),
      source: current.source,
      sourceLabel: sourceOf(current),
    },
    planned: planned.map((version) => {
      const { text, detail } = describe(version);
      // A change of where it comes from is part of the change, such as back to the terms' week.
      const source = version.source !== current?.source || version.source === "THEIR_OWN";
      return t("people.panel.terms.planned", {
        date: shortDate(version.startDate),
        change: [text, detail, source && sourceOf(version)].filter(Boolean).join(" · "),
      });
    }),
  };
}

function covers({ startDate, endDate }: TermsPeriod, date: string): boolean {
  return (startDate ?? "") <= date && (endDate == null || endDate >= date);
}
