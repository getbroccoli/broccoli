import { Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { BankHolidayCalendar, StandardWorkingWeek } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { t } from "@/i18n";

import { daysOffInAll, NATIONS, type Policy, SELECT_CLASS, WEEKS } from "./leaveOptions";

/** One numbered question of the page. */
export function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("setup.leave.stepNumber", { number: String(number) })}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** One nation's answer to a question, named when the page has several nations. */
export function NationChoice({
  nation,
  people,
  showName,
  children,
}: {
  nation: BankHolidayCalendar;
  people?: number;
  showName: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {showName && (
        <h3 className="text-sm font-medium">
          {t("setup.leave.termsTitle", { name: t(`setup.leave.nation.${nation}`) })}
          {people !== undefined && (
            <span className="font-normal text-muted-foreground">
              {" · "}
              {people === 1
                ? t("setup.leave.peopleOne")
                : t("setup.leave.people", { count: String(people) })}
            </span>
          )}
        </h3>
      )}
      {children}
    </div>
  );
}

/** "**20** days to book". */
function PolicyDays({ days }: { days: number }) {
  return (
    <>
      <span className="text-2xl font-semibold tabular-nums">{days}</span>{" "}
      <span className="text-sm font-normal text-muted-foreground">
        {t("setup.leave.daysToBook")}
      </span>
    </>
  );
}

/** A location's nation, with "Please check" while the AI couldn't tell. */
function LocationTerms({
  name,
  nation,
  unsure,
  onChange,
}: {
  name: string;
  nation: BankHolidayCalendar;
  unsure: boolean;
  onChange: (nation: BankHolidayCalendar) => void;
}) {
  return (
    <li className="flex flex-col gap-1">
      <label htmlFor={`location-${name}`} className="text-sm">
        {name}
      </label>
      <select
        id={`location-${name}`}
        className={SELECT_CLASS}
        value={nation}
        onChange={(event) => onChange(event.target.value as BankHolidayCalendar)}
      >
        {NATIONS.map((option) => (
          <option key={option} value={option}>
            {t(`setup.leave.nation.${option}`)}
          </option>
        ))}
      </select>
      {unsure && (
        <span className="flex items-center gap-1 text-xs text-amber-800">
          <Warning aria-hidden />
          {t("setup.leave.pleaseCheck")}
        </span>
      )}
    </li>
  );
}

/** One nation's Annual leave, a card per standard policy. */
export function PolicyCards({
  nation,
  policies,
  selectedId,
  bankHolidays,
  onSelect,
}: {
  nation: BankHolidayCalendar;
  policies: readonly Policy[];
  selectedId: string;
  bankHolidays: number;
  onSelect: (policyId: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {policies.map((policy) => (
        <OptionCard
          key={policy.id}
          name={`policy-${nation}`}
          value={policy.id}
          selected={selectedId}
          onSelect={onSelect}
          title={<PolicyDays days={policy.daysForFiveDayWeek} />}
          hint={
            policy.bankHolidaysOnTop
              ? t("setup.leave.bankHolidaysOnTop", {
                  count: String(bankHolidays),
                  total: String(daysOffInAll(policy, bankHolidays)),
                })
              : t("setup.leave.bankHolidaysIncluded")
          }
        />
      ))}
    </div>
  );
}

/** One nation's working week, a card per standard week. */
export function WeekCards({
  nation,
  selected,
  onSelect,
}: {
  nation: BankHolidayCalendar;
  selected: StandardWorkingWeek;
  onSelect: (week: StandardWorkingWeek) => void;
}) {
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

/** Step 1, shown when people have locations: each location's nation. */
export function LocationsStep({
  names,
  nationOf,
  unsure,
  checking,
  onPick,
}: {
  names: readonly string[];
  nationOf: (name: string) => BankHolidayCalendar;
  unsure: (name: string) => boolean;
  checking: boolean;
  onPick: (name: string, nation: BankHolidayCalendar) => void;
}) {
  return (
    <Step
      number={1}
      title={t("setup.leave.locationTerms")}
      hint={checking ? t("setup.leave.checking") : t("setup.leave.locationTermsHint")}
    >
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {names.map((name) => (
          <LocationTerms
            key={name}
            name={name}
            nation={nationOf(name)}
            unsure={unsure(name)}
            onChange={(nation) => onPick(name, nation)}
          />
        ))}
      </ul>
    </Step>
  );
}
