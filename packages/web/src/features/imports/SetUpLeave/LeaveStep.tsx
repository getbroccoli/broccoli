import { useQuery } from "@apollo/client/react";
import { ArrowRight, Warning } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  type BankHolidayCalendar,
  LeaveStepDocument,
  LocationCalendarSuggestionsDocument,
  type StandardWorkingWeek,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_SETUP_INVITE_SEARCH,
  SetupLayout,
  SetupStepForm,
  useSetupPages,
} from "@/features/setup";
import { t } from "@/i18n";

import { BackToReview } from "../BackToReview";
import { readLeaveChoice, saveLeaveChoice } from "./leaveChoice";

/** England and Wales first: new people start on its terms, so its card always shows. */
const NATIONS = [
  "ENGLAND_AND_WALES",
  "SCOTLAND",
  "NORTHERN_IRELAND",
] as const satisfies readonly BankHolidayCalendar[];

const WEEKS = [
  "MONDAY_TO_FRIDAY_7_5_HOURS",
  "MONDAY_TO_FRIDAY_8_HOURS",
  "MONDAY_TO_FRIDAY_7_HOURS",
  "MONDAY_TO_THURSDAY_8_HOURS",
] as const satisfies readonly StandardWorkingWeek[];

type Choices<Value> = Partial<Record<BankHolidayCalendar, Value>>;

const SELECT_CLASS =
  "h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * "Set up leave", after Approve: one card per nation's terms the owner's people will be on, each
 * with its working week and Annual leave, and which terms each location gets, Broccoli's AI
 * suggesting them from the names. Nothing is saved here: the choice goes with setup's last page.
 */
export function LeaveStep() {
  // The owner's earlier choice, when they come back to the page.
  const [saved] = useState(readLeaveChoice);
  const earlier = saved?.terms ?? [];
  const [weeks, setWeeks] = useState<Choices<StandardWorkingWeek>>(() =>
    Object.fromEntries(earlier.map((terms) => [terms.bankHolidayCalendar, terms.workingWeek])),
  );
  const [policies, setPolicies] = useState<Choices<string>>(() =>
    Object.fromEntries(
      earlier.map((terms) => [terms.bankHolidayCalendar, terms.annualLeavePolicyId]),
    ),
  );
  const [picked, setPicked] = useState<Record<string, BankHolidayCalendar>>(() =>
    Object.fromEntries(
      (saved?.locationTerms ?? []).map((location) => [
        location.locationName,
        location.bankHolidayCalendar,
      ]),
    ),
  );
  const { data, error } = useQuery(LeaveStepDocument, { fetchPolicy: "cache-and-network" });
  const navigate = useNavigate();
  const { next } = useSetupPages("leave");

  const locations = data?.import.readyLocations ?? [];
  const suggested = useQuery(LocationCalendarSuggestionsDocument, {
    variables: { locationNames: locations.map(({ name }) => name) },
    skip: locations.length === 0,
  });
  const suggestions = suggested.data?.locationCalendarSuggestions ?? [];
  const suggestionOf = (name: string) => suggestions.find((s) => s.locationName === name);
  const nationOf = (name: string): BankHolidayCalendar =>
    picked[name] ?? suggestionOf(name)?.bankHolidayCalendar ?? "ENGLAND_AND_WALES";
  // Without Jev's answer, a location is England and Wales until the owner says otherwise.
  const unsure = (name: string) =>
    !(name in picked) && !suggested.loading && (suggestionOf(name)?.unsure ?? true);

  const policyOptions = data?.leaveSetup.annualLeavePolicies ?? [];
  const nations = NATIONS.filter(
    (nation) =>
      nation === "ENGLAND_AND_WALES" || locations.some(({ name }) => nationOf(name) === nation),
  );
  const weekOf = (nation: BankHolidayCalendar) => weeks[nation] ?? WEEKS[0];
  const policyOf = (nation: BankHolidayCalendar) => policies[nation] ?? policyOptions[0]?.id ?? "";
  const withoutLocation =
    (data?.import.readyEmployeeCount ?? 0) -
    locations.reduce((sum, { peopleCount }) => sum + peopleCount, 0);

  const go = (choice: Parameters<typeof saveLeaveChoice>[0]) => {
    saveLeaveChoice(choice);
    void navigate({ to: next, search: DEFAULT_SETUP_INVITE_SEARCH });
  };
  const turnOn = () =>
    go({
      terms: nations.map((nation) => ({
        bankHolidayCalendar: nation,
        workingWeek: weekOf(nation),
        annualLeavePolicyId: policyOf(nation),
      })),
      locationTerms: locations.map(({ name }) => ({
        locationName: name,
        bankHolidayCalendar: nationOf(name),
      })),
    });

  return (
    <SetupLayout
      step="leave"
      title={t("setup.leave.title")}
      description={t("setup.leave.description")}
      width="wide"
    >
      <SetupStepForm
        width="wide"
        onSubmit={turnOn}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <BackToReview />
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" size="lg" onClick={() => go(null)}>
                {t("setup.leave.skip")}
              </Button>
              <Button type="submit" size="lg" className="h-10 gap-2 px-4" disabled={!data}>
                {t("setup.leave.turnOn")}
                <ArrowRight weight="bold" aria-hidden />
              </Button>
            </div>
          </div>
        }
      >
        {nations.map((nation) => {
          const here = locations.filter(({ name }) => nationOf(name) === nation);
          const isDefault = nation === "ENGLAND_AND_WALES";
          const people =
            here.reduce((sum, { peopleCount }) => sum + peopleCount, 0) +
            (isDefault ? withoutLocation : 0);
          const holidays = data?.leaveSetup.bankHolidayCalendars.find(
            ({ calendar }) => calendar === nation,
          );
          const nationName = t(`setup.leave.nation.${nation}`);
          return (
            <section key={nation} className="flex flex-col gap-4 rounded-xl border p-5">
              <h2 className="text-base font-semibold">
                {t("setup.leave.termsTitle", { name: nationName })}
                <span className="font-normal text-muted-foreground">
                  {" · "}
                  {people === 1
                    ? t("setup.leave.peopleOne")
                    : t("setup.leave.people", { count: String(people) })}
                </span>
              </h2>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr] sm:items-center">
                <dt className="text-muted-foreground">{t("setup.leave.locations")}</dt>
                <dd>
                  {[
                    ...here.map(({ name }) => name),
                    ...(isDefault && withoutLocation > 0
                      ? [t("setup.leave.noLocation", { count: String(withoutLocation) })]
                      : []),
                  ].join(", ") || t("setup.leave.noLocations")}
                </dd>
                <dt>
                  <label htmlFor={`week-${nation}`} className="text-muted-foreground">
                    {t("setup.leave.workingWeek")}
                  </label>
                </dt>
                <dd>
                  <select
                    id={`week-${nation}`}
                    className={SELECT_CLASS}
                    value={weekOf(nation)}
                    onChange={(event) =>
                      setWeeks({ ...weeks, [nation]: event.target.value as StandardWorkingWeek })
                    }
                  >
                    {WEEKS.map((week) => (
                      <option key={week} value={week}>
                        {t(`setup.leave.week.${week}`)}
                      </option>
                    ))}
                  </select>
                </dd>
                <dt className="text-muted-foreground">{t("setup.leave.bankHolidays")}</dt>
                <dd>
                  {t("setup.leave.bankHolidaysCount", {
                    nation: nationName,
                    count: String(holidays?.countThisYear ?? 0),
                    year: String(new Date().getFullYear()),
                  })}
                </dd>
                <dt>
                  <label htmlFor={`policy-${nation}`} className="text-muted-foreground">
                    {t("setup.leave.annualLeave")}
                  </label>
                </dt>
                <dd>
                  <select
                    id={`policy-${nation}`}
                    className={SELECT_CLASS}
                    value={policyOf(nation)}
                    onChange={(event) => setPolicies({ ...policies, [nation]: event.target.value })}
                  >
                    {policyOptions.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </dd>
                <dt className="text-muted-foreground">{t("setup.leave.alsoRecorded")}</dt>
                <dd>{t("setup.leave.alsoRecordedTypes")}</dd>
              </dl>
              {isDefault && (
                <p className="text-sm text-muted-foreground">{t("setup.leave.newPeople")}</p>
              )}
            </section>
          );
        })}
        {locations.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">{t("setup.leave.locationTerms")}</h2>
            <p className="text-sm text-muted-foreground">
              {suggested.loading ? t("setup.leave.checking") : t("setup.leave.locationTermsHint")}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {locations.map(({ name }) => (
                <li key={name} className="flex flex-col gap-1">
                  <label htmlFor={`location-${name}`} className="text-sm">
                    {name}
                  </label>
                  <select
                    id={`location-${name}`}
                    className={SELECT_CLASS}
                    value={nationOf(name)}
                    onChange={(event) =>
                      setPicked({ ...picked, [name]: event.target.value as BankHolidayCalendar })
                    }
                  >
                    {NATIONS.map((nation) => (
                      <option key={nation} value={nation}>
                        {t(`setup.leave.nation.${nation}`)}
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
          </section>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.leave.loadFailed")}
          </p>
        )}
      </SetupStepForm>
    </SetupLayout>
  );
}
