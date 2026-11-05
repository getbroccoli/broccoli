import type {
  BankHolidayCalendar,
  LeaveStepQuery,
  StandardWorkingWeek,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

/** England and Wales first: people without a location start on its terms, so it always shows. */
export const NATIONS = [
  "ENGLAND_AND_WALES",
  "SCOTLAND",
  "NORTHERN_IRELAND",
] as const satisfies readonly BankHolidayCalendar[];

export const WEEKS = [
  "MONDAY_TO_FRIDAY_7_5_HOURS",
  "MONDAY_TO_FRIDAY_8_HOURS",
  "MONDAY_TO_FRIDAY_7_HOURS",
  "MONDAY_TO_THURSDAY_8_HOURS",
] as const satisfies readonly StandardWorkingWeek[];

export type Policy = LeaveStepQuery["leaveSetup"]["annualLeavePolicies"][number];

/** Days off a year for a five-day week: the days to book, plus bank holidays when on top. */
export function daysOffInAll(policy: Policy | undefined, bankHolidays: number): number {
  if (!policy) return 0;
  return policy.daysForFiveDayWeek + (policy.bankHolidaysOnTop ? bankHolidays : 0);
}

/** "28 days off a year", or each nation's when there are several. */
export function daysOffSummary(
  perNation: { nation: BankHolidayCalendar; daysOff: number }[],
): string {
  if (perNation.length === 1) {
    return t("setup.leave.daysOffSummary", { count: String(perNation[0]!.daysOff) });
  }
  return t("setup.leave.daysOffSummaryNations", {
    nations: perNation
      .map(({ nation, daysOff }) => `${t(`setup.leave.nation.${nation}`)} ${daysOff}`)
      .join(" · "),
  });
}
