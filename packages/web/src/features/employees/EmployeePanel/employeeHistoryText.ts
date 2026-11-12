import type { BankHolidayCalendar } from "@/__generated__/graphql";
import {
  calendarName,
  DAY_FIELDS,
  ruleSummary,
  shortDate,
  storedRuleText,
  type WeekMinutes,
  weekSummary,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

/**
 * A change to a person's terms as the words after its author: "changed terms to Scotland from
 * 1 Dec 2026", or "cancelled the change of terms to …" for a cancelled move; null for other fields.
 */
export function employeeChangeSentence({
  field,
  oldValue,
  newValue,
  oldLabel,
  newLabel,
}: {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel?: string | null;
  newLabel?: string | null;
}): string | null {
  if (field === "workingWeek") return weekSentence(oldValue, newValue);
  if (field.startsWith("timeOff.")) {
    return rulesSentence(oldValue, newValue, newLabel ?? oldLabel ?? "");
  }
  if (field !== "terms") return null;
  const move = parseMove(newValue);
  if (move) {
    return t("people.panel.terms.history.changed", {
      terms: newLabel ?? "",
      date: shortDate(move.startDate),
    });
  }
  const cancelled = parseMove(oldValue);
  return (
    cancelled &&
    t("people.panel.terms.history.cancelled", {
      terms: oldLabel ?? "",
      date: shortDate(cancelled.startDate),
    })
  );
}

/**
 * A change to the person's own week: given, changed, given back to the terms, or a planned change
 * cancelled (no new value).
 */
function weekSentence(oldValue: string | null, newValue: string | null): string | null {
  const before = parseWeekChange(oldValue);
  const after = parseWeekChange(newValue);
  if (!after) {
    return before && t("ownWeek.history.cancelled", { date: shortDate(before.startDate) });
  }
  const date = shortDate(after.startDate);
  if (!after.week) return t("ownWeek.history.back", { date });
  const week = [
    weekSummary(minutesOf(after.week.minutes)),
    t("people.panel.terms.bankHolidays", {
      calendar: calendarName(after.week.bankHolidayCalendar.toUpperCase() as BankHolidayCalendar),
    }),
  ].join(" · ");
  return t(before?.week ? "ownWeek.history.changed" : "ownWeek.history.gave", { week, date });
}

/**
 * A change to the person's own rules for a type: given, changed, given back to the terms, or a
 * planned change cancelled (no new value). Null for a line in another shape, such as Publish's.
 */
function rulesSentence(
  oldValue: string | null,
  newValue: string | null,
  typeName: string,
): string | null {
  const before = parseRulesChange(oldValue);
  const after = parseRulesChange(newValue);
  if (!after) {
    return (
      before &&
      t("ownRules.history.cancelled", { type: typeName, date: shortDate(before.startDate) })
    );
  }
  const date = shortDate(after.startDate);
  if (!after.rules) return t("ownRules.history.back", { type: typeName, date });
  // Mid-sentence: "to unlimited", not "to Unlimited".
  const rule = ruleSummary(storedRuleText(after.rules)).toLowerCase();
  return t(before?.rules ? "ownRules.history.changed" : "ownRules.history.gave", {
    type: typeName,
    rule,
    date,
  });
}

/** An own-rules change's stored value: the rules, null for the terms', and the date they apply from. */
type RulesChange = {
  startDate: string;
  rules: { balance: string; entitlementDays: number | null; bankHolidays: string | null } | null;
};

function parseRulesChange(value: string | null): RulesChange | null {
  const parsed = value === null ? null : (JSON.parse(value) as Partial<RulesChange>);
  return parsed && "rules" in parsed ? (parsed as RulesChange) : null;
}

/** An own-week change's stored value: the week, null for the terms', and the date it applies from. */
type WeekChange = {
  week: { minutes: number[]; bankHolidayCalendar: string } | null;
  startDate: string;
};

function parseWeekChange(value: string | null): WeekChange | null {
  return value === null ? null : (JSON.parse(value) as WeekChange);
}

function minutesOf(minutes: readonly number[]): WeekMinutes {
  return Object.fromEntries(
    DAY_FIELDS.map((day, index) => [day, minutes[index] ?? 0]),
  ) as WeekMinutes;
}

/** A terms change's stored value: the terms and the date it applies from. */
function parseMove(value: string | null): { termsId: string; startDate: string } | null {
  return value === null ? null : (JSON.parse(value) as { termsId: string; startDate: string });
}
