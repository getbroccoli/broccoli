import type { EmploymentTermsStackQuery, TermsDeleteBlocker } from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { calendarDayOf, calendarDayParts } from "@/lib/calendarDay";

/** A working week's minutes per day, Monday first. */
export type WeekMinutes = Record<(typeof DAY_FIELDS)[number], number>;

/** A time off policy version's rules, as the terms' rows describe them. */
export type PolicyVersionText = Pick<
  NonNullable<EmploymentTermsStackQuery["terms"]>["timeOff"][number]["versions"][number],
  "startDate" | "balance" | "bankHolidays" | "leaveYearStart" | "yearlyEntitlement"
>;

/** "Mon–Fri, 7.5 hours"; days that are not a run are listed; unequal hours read as a weekly total. */
export function weekSummary(week: WeekMinutes): string {
  const worked = DAY_FIELDS.flatMap((field, index) => (week[field] > 0 ? [index] : []));
  if (worked.length === 0) return t("terms.week.none");
  const minutes = worked.map((index) => week[DAY_FIELDS[index]!]);
  const hours = minutes.every((value) => value === minutes[0])
    ? t("terms.week.hours", { hours: hoursOf(minutes[0]!) })
    : t("terms.week.hoursAWeek", { hours: hoursOf(minutes.reduce((sum, value) => sum + value)) });
  return `${daysText(worked)}, ${hours}`;
}

/** The list's Annual leave cell from the version covering today; null: not offered. */
export function annualLeaveSummary(version: PolicyVersionText | null): string {
  if (!version) return t("terms.annualLeave.notOffered");
  if (version.balance === "UNLIMITED_BALANCE") return t("terms.rule.unlimited");
  if (version.balance === "NO_BALANCE") return t("terms.annualLeave.doesNotCount");
  return t(
    version.bankHolidays === "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE"
      ? "terms.annualLeave.daysIncluded"
      : "terms.annualLeave.daysOnTop",
    { days: daysOf(version) },
  );
}

/** A time off type's rule line: how it counts, its allowance and its leave year. */
export function ruleLine(version: PolicyVersionText): string {
  if (version.balance === "NO_BALANCE") return t("terms.rule.recorded");
  const leaveYear = leaveYearText(version);
  return version.balance === "UNLIMITED_BALANCE"
    ? [t("terms.rule.unlimited"), leaveYear].join(" · ")
    : [t("terms.rule.fromBalance"), allowanceText(version), leaveYear].join(" · ");
}

/** A planned version's line: "From 1 Jan 2027: 22 days a year, bank holidays on top". */
export function plannedLine(version: PolicyVersionText): string {
  return t("terms.planned", {
    date: shortDate(version.startDate ?? ""),
    rule:
      version.balance === "NO_BALANCE"
        ? t("terms.rule.recordedLower")
        : version.balance === "UNLIMITED_BALANCE"
          ? t("terms.rule.unlimited")
          : allowanceText(version),
  });
}

/** A working week as its planned line: "From 1 Dec 2026: Mon–Thu, 8 hours". */
export function plannedWeekLine(version: WeekMinutes & { startDate?: string | null }): string {
  return t("terms.planned", {
    date: shortDate(version.startDate ?? ""),
    rule: weekSummary(version),
  });
}

/**
 * Versions from today on, as the API sends them, split into the one covering `today`, if any, and
 * the planned ones; one that ended since they were read, such as a page left open overnight, goes.
 */
export function splitVersions<V extends { startDate?: string | null; endDate?: string | null }>(
  allVersions: readonly V[],
  today: string,
): { current: V | null; planned: V[] } {
  const versions = allVersions.filter(({ endDate }) => endDate == null || endDate >= today);
  const first = versions[0];
  const firstIsCurrent = first !== undefined && (first.startDate ?? "") <= today;
  return {
    current: firstIsCurrent ? first : null,
    planned: versions.slice(firstIsCurrent ? 1 : 0),
  };
}

/** The company's today, in London, as the API decides which versions are from today on. */
export function companyToday(): string {
  return calendarDayOf(new Date(), "Europe/London");
}

/** Minutes as hours without a trailing ".0": 450 as "7.5", 480 as "8". */
export function hoursOf(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

/** The seven day fields, Monday first, as the working week's cells show them. */
export const DAY_FIELDS = [
  "mondayMinutes",
  "tuesdayMinutes",
  "wednesdayMinutes",
  "thursdayMinutes",
  "fridayMinutes",
  "saturdayMinutes",
  "sundayMinutes",
] as const;

/** Each day's short name, Monday first. */
export const DAY_NAMES: MessageKey[] = [
  "terms.day.mon",
  "terms.day.tue",
  "terms.day.wed",
  "terms.day.thu",
  "terms.day.fri",
  "terms.day.sat",
  "terms.day.sun",
];

function daysText(worked: number[]): string {
  const isRun = worked.every((day, index) => index === 0 || day === worked[index - 1]! + 1);
  if (isRun && worked.length > 1) {
    return `${t(DAY_NAMES[worked[0]!]!)}–${t(DAY_NAMES[worked.at(-1)!]!)}`;
  }
  return worked.map((day) => t(DAY_NAMES[day]!)).join(", ");
}

function allowanceText(version: PolicyVersionText): string {
  return t(
    version.bankHolidays === "BANK_HOLIDAYS_INCLUDED_IN_ALLOWANCE"
      ? "terms.rule.daysIncluded"
      : "terms.rule.daysOnTop",
    { days: daysOf(version) },
  );
}

/** The disabled Delete item's reason, naming the locations that start people on the terms. */
export function deleteReason(
  blocker: TermsDeleteBlocker,
  locationNames: readonly string[],
): string {
  switch (blocker) {
    case "DEFAULT_TERMS":
      return t("terms.delete.default");
    case "TERMS_HAD_PEOPLE":
      return t("terms.delete.hadPeople");
    case "LOCATION_STARTS_PEOPLE_ON_TERMS":
      return t(locationNames.length === 1 ? "terms.delete.location" : "terms.delete.locations", {
        locations: LIST.format(locationNames),
      });
  }
}

/** The taken-name error, naming the terms already called so, matched ignoring case and surrounding spaces. */
export function takenNameError(name: string, termsNames: readonly string[]): string {
  const taken = termsNames.find((existing) => sameName(existing, name));
  return taken ? t("terms.name.taken", { name: taken }) : t("terms.name.takenUnknown");
}

/** The name field's message for a refused save, by its error code; a failure without one reads generic. */
export function nameError(
  code: string | undefined,
  name: string,
  termsNames: readonly string[],
): string {
  if (code === "taken") return takenNameError(name, termsNames);
  if (code === "required") return t("terms.name.required");
  if (code === "too_long") return t("terms.name.tooLong");
  return t("terms.saveFailed");
}

function sameName(one: string, other: string): boolean {
  return one.trim().toLowerCase() === other.trim().toLowerCase();
}

function leaveYearText({ leaveYearStart }: PolicyVersionText): string {
  if (leaveYearStart?.kind === "LEAVE_YEAR_FROM_EMPLOYEE_START_DATE") {
    return t("terms.rule.leaveYearFromStart");
  }
  const date = new Date(Date.UTC(2000, (leaveYearStart?.month ?? 1) - 1, leaveYearStart?.day ?? 1));
  return t("terms.rule.leaveYearFrom", { date: DAY_AND_MONTH.format(date) });
}

function daysOf(version: PolicyVersionText): string {
  return String(version.yearlyEntitlement?.days ?? 0);
}

function shortDate(value: string): string {
  return SHORT_DATE.format(Date.UTC(...calendarDayParts(value)));
}

// Formatted in UTC from a UTC timestamp, so no time zone moves the calendar day.
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_AND_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });
