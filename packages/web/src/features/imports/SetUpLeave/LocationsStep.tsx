import { Warning } from "@phosphor-icons/react";

import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { NATIONS } from "./leaveOptions";
import { Step } from "./Step";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

type Props = {
  names: readonly string[];
  nationOf: (name: string) => BankHolidayCalendar;
  /** True while the AI couldn't tell and the owner hasn't picked: "Please check". */
  unsure: (name: string) => boolean;
  checking: boolean;
  onPick: (name: string, nation: BankHolidayCalendar) => void;
};

/** Step 1, shown when people have locations: each location's nation. */
export function LocationsStep({ names, nationOf, unsure, checking, onPick }: Props) {
  return (
    <Step
      number={1}
      title={t("setup.leave.locationTerms")}
      hint={checking ? t("setup.leave.checking") : t("setup.leave.locationTermsHint")}
    >
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {names.map((name) => (
          <li key={name} className="flex flex-col gap-1">
            <label htmlFor={`location-${name}`} className="text-sm">
              {name}
            </label>
            <select
              id={`location-${name}`}
              className={SELECT_CLASS}
              value={nationOf(name)}
              onChange={(event) => onPick(name, event.target.value as BankHolidayCalendar)}
            >
              {NATIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`setup.leave.nation.${option}`)}
                </option>
              ))}
            </select>
            {unsure(name) && (
              <span className="flex items-center gap-1 text-xs text-amber-800">
                <Warning aria-hidden />
                {t("setup.leave.pleaseCheck")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Step>
  );
}
