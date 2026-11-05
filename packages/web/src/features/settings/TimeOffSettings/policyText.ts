import type { TimeOffPolicySummaryFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

type Policy = Pick<TimeOffPolicySummaryFragment, "balance" | "allowance">;
type Reach = Pick<TimeOffPolicySummaryFragment, "terms" | "peopleCount" | "ownAssignmentCount">;

/** How a policy counts, such as "20 days + bank holidays" or "Doesn't count". */
export function countsText({ balance, allowance }: Policy): string {
  if (balance === "UNLIMITED_BALANCE") return t("settings.timeOff.unlimited");
  if (balance === "NO_BALANCE" || !allowance) return t("settings.timeOff.doesNotCount");
  return t(
    allowance.bankHolidays === "BANK_HOLIDAYS_ON_TOP_OF_ALLOWANCE"
      ? "settings.timeOff.daysOnTop"
      : "settings.timeOff.daysIncluded",
    { days: formatDays(allowance.days) },
  );
}

/** Who a policy applies to today, such as "England and Wales · 31 people, and 2 on their own". */
export function reachText({ terms, peopleCount, ownAssignmentCount }: Reach): string {
  if (terms.length === 0 && peopleCount === 0) return t("settings.timeOff.noTerms");
  const own = t("settings.timeOff.ownPolicy", { count: String(ownAssignmentCount) });
  if (terms.length === 0) return own;
  const onTerms = `${terms.map(({ name }) => name).join(", ")} · ${peopleText(peopleCount - ownAssignmentCount)}`;
  return ownAssignmentCount === 0 ? onTerms : t("settings.timeOff.andOwn", { reach: onTerms, own });
}

function peopleText(count: number): string {
  return count === 1
    ? t("settings.timeOff.personOne")
    : t("settings.timeOff.people", { count: String(count) });
}
