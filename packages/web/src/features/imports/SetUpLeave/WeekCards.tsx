import type { BankHolidayCalendar, StandardWorkingWeek } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

import { WEEKS } from "./leaveOptions";

type Props = {
  nation: BankHolidayCalendar;
  selected: StandardWorkingWeek;
  onSelect: (week: StandardWorkingWeek) => void;
};

/** One nation's working week, a card per standard week. */
export function WeekCards({ nation, selected, onSelect }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {WEEKS.map((week) => (
        <OptionCard
          key={week}
          name={`week-${nation}`}
          value={week}
          selected={selected}
          onSelect={onSelect}
          title={t(`setup.leave.weekDays.${week}`)}
          hint={t(`setup.leave.weekHours.${week}`)}
        />
      ))}
    </div>
  );
}
