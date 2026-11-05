import type { StandardWorkingWeek } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { WEEKS } from "./timeOffOptions";

type Props = {
  selected: StandardWorkingWeek;
  onSelect: (week: StandardWorkingWeek) => void;
};

/** Everyone's working week, a card per standard week with its working days marked. */
export function WeekCards({ selected, onSelect }: Props) {
  return (
    <div className="grid gap-2.5 @lg:grid-cols-2 @3xl:grid-cols-4">
      {WEEKS.map(({ week, days }) => (
        <OptionCard
          key={week}
          name="week"
          value={week}
          selected={selected}
          onSelect={onSelect}
          title={t(`setup.timeOff.week.${week}`)}
          hint={
            <span className="flex flex-col gap-2">
              {t(`setup.timeOff.weekHours.${week}`)}
              <span aria-hidden className="flex gap-[3px]">
                {WEEKDAYS.map((day) => (
                  <span
                    key={day}
                    className={cn(
                      "flex size-[18px] items-center justify-center rounded-[5px] text-[10px] font-semibold",
                      day < days
                        ? "bg-brand-soft text-brand-deep"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`setup.timeOff.weekday.${day}`)}
                  </span>
                ))}
              </span>
            </span>
          }
        />
      ))}
    </div>
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
