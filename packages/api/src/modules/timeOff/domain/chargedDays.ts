import { type CalendarDate, coversDate } from "../../../utils";
import type { DatedPolicy } from "./allowanceCalculator";

/**
 * The booked days a leave year's allowance is charged for, given the year's policies: every day,
 * unless the year counts from the allowance on some day; then only days under allowance rules,
 * since a day booked under Unlimited or doesn't-count rules costs the allowance nothing.
 */
export function chargedDays<D extends { date: CalendarDate }>(
  days: readonly D[],
  policies: readonly DatedPolicy[],
): D[] {
  const counted = policies.filter(({ balance }) => balance === "balance_from_allowance");
  return counted.length === 0
    ? [...days]
    : days.filter(({ date }) => counted.some((policy) => coversDate(policy, date)));
}
