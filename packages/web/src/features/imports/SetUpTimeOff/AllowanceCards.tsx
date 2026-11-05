import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

import type { Policy } from "./timeOffOptions";

type Props = {
  /** Most common first. */
  policies: readonly Policy[];
  selectedId: string;
  /** Bank holidays this year where most people work, for "days off in all". */
  bankHolidays: number;
  onSelect: (policyId: string) => void;
};

/** The Annual leave everyone gets, a card per standard policy: "**20** days". */
export function AllowanceCards({ policies, selectedId, bankHolidays, onSelect }: Props) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {policies.map((policy, index) => (
        <OptionCard
          key={policy.id}
          name="allowance"
          value={policy.id}
          selected={selectedId}
          onSelect={onSelect}
          title={
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-2xl leading-tight font-semibold tracking-tight tabular-nums">
                {policy.daysForFiveDayWeek}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {t("setup.timeOff.days")}
              </span>
              {index === 0 && (
                <span className="ml-auto self-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                  {t("setup.timeOff.mostCommon")}
                </span>
              )}
            </span>
          }
          hint={
            // The one standard policy without bank holidays on top is the statutory minimum.
            policy.bankHolidaysOnTop
              ? t("setup.timeOff.bankHolidaysOnTop", {
                  total: String(policy.daysForFiveDayWeek + bankHolidays),
                })
              : t("setup.timeOff.bankHolidaysIncluded")
          }
        />
      ))}
    </div>
  );
}
