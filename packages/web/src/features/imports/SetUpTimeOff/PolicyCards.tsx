import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

import { daysOffInAll, type Policy } from "./timeOffOptions";

type Props = {
  nation: BankHolidayCalendar;
  policies: readonly Policy[];
  selectedId: string;
  /** The nation's bank holidays this year. */
  bankHolidays: number;
  onSelect: (policyId: string) => void;
};

/**
 * One nation's Annual leave, a card per standard policy: "**20** days to book" with bank holidays
 * on top, or "**28** days off in all" when bank holidays come out of them.
 */
export function PolicyCards({ nation, policies, selectedId, bankHolidays, onSelect }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {policies.map((policy) => (
        <OptionCard
          key={policy.id}
          name={`policy-${nation}`}
          value={policy.id}
          selected={selectedId}
          onSelect={onSelect}
          title={
            <>
              <span className="text-2xl font-semibold tabular-nums">
                {policy.daysForFiveDayWeek}
              </span>{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {policy.bankHolidaysOnTop
                  ? t("setup.timeOff.daysToBook")
                  : t("setup.timeOff.daysOffInAll")}
              </span>
            </>
          }
          hint={
            policy.bankHolidaysOnTop
              ? t("setup.timeOff.bankHolidaysOnTop", {
                  count: String(bankHolidays),
                  total: String(daysOffInAll(policy, bankHolidays)),
                })
              : t("setup.timeOff.bankHolidaysIncluded", {
                  count: String(bankHolidays),
                  left: String(policy.daysForFiveDayWeek - bankHolidays),
                })
          }
        />
      ))}
    </div>
  );
}
