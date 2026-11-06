import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

import type { Policy } from "./timeOffOptions";

type Props = {
  /** Most common first. */
  policies: readonly Policy[];
  selectedKey: Policy["key"];
  /** This year's bank holidays when everyone has one calendar, for "days off in all"; else null. */
  bankHolidays: number | null;
  onSelect: (policyKey: Policy["key"]) => void;
};

/** The Annual leave everyone gets, a card per standard policy: "**20** days". */
export function AllowanceCards({ policies, selectedKey, bankHolidays, onSelect }: Props) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {policies.map((policy, index) => (
        <OptionCard
          key={policy.key}
          name="allowance"
          value={policy.key}
          selected={selectedKey}
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
            !policy.bankHolidaysOnTop
              ? t("setup.timeOff.bankHolidaysIncluded")
              : bankHolidays === null
                ? t("setup.timeOff.bankHolidaysOnTopByCalendar")
                : t("setup.timeOff.bankHolidaysOnTop", {
                    total: String(policy.daysForFiveDayWeek + bankHolidays),
                  })
          }
        />
      ))}
    </div>
  );
}
