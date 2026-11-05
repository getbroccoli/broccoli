import { MapPin } from "@phosphor-icons/react";

import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { NATIONS } from "./timeOffOptions";

type Props = {
  locations: readonly { name: string; peopleCount: number }[];
  nationOf: (name: string) => BankHolidayCalendar;
  /** True while the AI couldn't tell and the owner hasn't picked: "Please check". */
  unsure: (name: string) => boolean;
  holidaysOf: (nation: BankHolidayCalendar) => number;
  onPick: (name: string, nation: BankHolidayCalendar) => void;
  /** People without a location, who get England and Wales. */
  withoutLocation: number;
};

/** Each location's bank holidays, a row per location with its nation. */
export function LocationCalendars({
  locations,
  nationOf,
  unsure,
  holidaysOf,
  onPick,
  withoutLocation,
}: Props) {
  return (
    <ul className="grid overflow-hidden rounded-xl border border-border lg:grid-cols-2">
      {locations.map(({ name, peopleCount }) => (
        <li key={name} className={ROW}>
          <MapPin size={16} aria-hidden className="shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-[1_1_120px] flex-col">
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
              {name}
              {unsure(name) && (
                <span className="rounded-full bg-amber-100 px-2 py-px text-[11px] font-semibold text-amber-800">
                  {t("setup.timeOff.pleaseCheck")}
                </span>
              )}
            </span>
            <span className="text-[13px] text-muted-foreground">{peopleOf(peopleCount)}</span>
          </span>
          <select
            aria-label={t("setup.timeOff.locationCalendar", { location: name })}
            className="h-9 min-w-[170px] rounded-lg border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            value={nationOf(name)}
            onChange={(event) => onPick(name, event.target.value as BankHolidayCalendar)}
          >
            {NATIONS.map((nation) => (
              <option key={nation} value={nation}>
                {t("setup.timeOff.nationOption", {
                  nation: t(`setup.timeOff.nation.${nation}`),
                  count: String(holidaysOf(nation)),
                })}
              </option>
            ))}
          </select>
        </li>
      ))}
      {withoutLocation > 0 && (
        <li className={ROW}>
          <MapPin size={16} aria-hidden className="shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-[1_1_120px] flex-col">
            <span className="text-sm font-semibold">{t("setup.timeOff.noLocation")}</span>
            <span className="text-[13px] text-muted-foreground">{peopleOf(withoutLocation)}</span>
          </span>
          <span className="text-sm">
            {t("setup.timeOff.nationOption", {
              nation: t("setup.timeOff.nation.ENGLAND_AND_WALES"),
              count: String(holidaysOf("ENGLAND_AND_WALES")),
            })}
          </span>
        </li>
      )}
    </ul>
  );
}

const ROW =
  "-mt-px -ml-px flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-l border-border px-3.5 py-2.5";

function peopleOf(count: number): string {
  return count === 1
    ? t("setup.timeOff.peopleOne")
    : t("setup.timeOff.people", { count: String(count) });
}
