import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

import { NATIONS } from "./timeOffOptions";

type Props = {
  selected: BankHolidayCalendar;
  holidaysOf: (nation: BankHolidayCalendar) => number;
  onSelect: (nation: BankHolidayCalendar) => void;
};

/** Everyone's bank holidays, when the staff file has no locations: a card per nation. */
export function NationCards({ selected, holidaysOf, onSelect }: Props) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {NATIONS.map((nation) => (
        <OptionCard
          key={nation}
          name="nation"
          value={nation}
          selected={selected}
          onSelect={onSelect}
          title={t(`setup.timeOff.nation.${nation}`)}
          hint={t("setup.timeOff.countThisYear", {
            count: String(holidaysOf(nation)),
            year: String(new Date().getFullYear()),
          })}
        />
      ))}
    </div>
  );
}
