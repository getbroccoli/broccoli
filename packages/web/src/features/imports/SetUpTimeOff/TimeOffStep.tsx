import { useQuery } from "@apollo/client/react";
import { ArrowRight, Lightbulb } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  type BankHolidayCalendar,
  LocationCalendarSuggestionsDocument,
  TimeOffStepDocument,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  type SetupInviteSearch,
  SetupLayout,
  SetupStepForm,
  useSetupPages,
} from "@/features/setup";
import { t } from "@/i18n";

import { BackToReview } from "../BackToReview";
import { AllowanceCards } from "./AllowanceCards";
import { AlsoReady } from "./AlsoReady";
import { LocationCalendars } from "./LocationCalendars";
import { NationCards } from "./NationCards";
import { Question } from "./Question";
import { readTimeOffSetup, saveTimeOffSetup, type TimeOffSetupState } from "./timeOffChoice";
import { NATIONS, WEEKS } from "./timeOffOptions";
import { WeekCards } from "./WeekCards";

type Props = {
  /** Who uses Broccoli's answers, carried through when the owner came back from it. */
  search: SetupInviteSearch;
};

/**
 * "Set up time off", after Approve: the company's defaults, one holiday allowance and working week
 * for everyone, and whose bank holidays apply: one nation for everyone when the staff file has no
 * locations, else each location's, Broccoli's AI suggesting them from the names. Nothing is saved
 * on the server here: the choice goes with setup's last page.
 */
export function TimeOffStep({ search }: Props) {
  // Kept in the tab on every change, so a reload or Back to the review keeps the owner's choices.
  const [state, setState] = useState(readTimeOffSetup);
  const { picked } = state;
  const change = (next: Partial<TimeOffSetupState>) => {
    const changed = { ...state, ...next };
    setState(changed);
    saveTimeOffSetup(changed);
  };
  const { data, error } = useQuery(TimeOffStepDocument, { fetchPolicy: "cache-and-network" });
  const navigate = useNavigate();
  const { next: nextPath } = useSetupPages("timeOff");

  const locations = data?.import.readyLocations ?? [];
  const hasLocations = locations.length > 0;
  const suggested = useQuery(LocationCalendarSuggestionsDocument, {
    variables: { locationNames: locations.map(({ name }) => name) },
    skip: !hasLocations,
  });
  const suggestions = suggested.data?.locationCalendarSuggestions ?? [];
  const suggestionOf = (name: string) => suggestions.find((s) => s.locationName === name);
  // Own keys only: a location may be named like an object's built-in property, such as "constructor".
  const isPicked = (name: string) => Object.hasOwn(picked, name);
  const nationOf = (name: string): BankHolidayCalendar =>
    (isPicked(name) ? picked[name] : suggestionOf(name)?.bankHolidayCalendar) ??
    "ENGLAND_AND_WALES";
  // Without the model's answer, a location is England and Wales until the owner says otherwise.
  const unsure = (name: string) =>
    !isPicked(name) && !suggested.loading && (suggestionOf(name)?.unsure ?? true);

  const policies = data?.timeOffSetup.annualLeavePolicies ?? [];
  const policyId = policies.find(({ id }) => id === state.policyId)?.id ?? policies[0]?.id ?? "";
  const week = state.week ?? WEEKS[0].week;
  const nation = state.nation ?? "ENGLAND_AND_WALES";
  const holidaysOf = (calendar: BankHolidayCalendar) =>
    data?.timeOffSetup.bankHolidayCalendars.find((entry) => entry.calendar === calendar)
      ?.countThisYear ?? 0;
  const peopleCount = data?.import.readyEmployeeCount ?? 0;
  const withoutLocation =
    peopleCount - locations.reduce((sum, { peopleCount: count }) => sum + count, 0);
  const peopleIn = (calendar: BankHolidayCalendar) =>
    locations
      .filter(({ name }) => nationOf(name) === calendar)
      .reduce((sum, { peopleCount: count }) => sum + count, 0) +
    (calendar === "ENGLAND_AND_WALES" ? withoutLocation : 0);
  // People without a location start on England and Wales whenever the file has locations.
  const defaultNation = hasLocations ? "ENGLAND_AND_WALES" : nation;
  const calendarsInUse = hasLocations
    ? NATIONS.filter((calendar) => peopleIn(calendar) > 0)
    : [nation];

  const go = (next: Partial<TimeOffSetupState>) => {
    change(next);
    void navigate({ to: nextPath, search });
  };
  const turnOn = () =>
    go({
      // The nations on screen become the owner's, so a later visit keeps them whatever the model says then.
      picked: Object.fromEntries(locations.map(({ name }) => [name, nationOf(name)])),
      timeOff: {
        terms: NATIONS.filter(
          (calendar) =>
            calendar === defaultNation || locations.some(({ name }) => nationOf(name) === calendar),
        ).map((calendar) => ({
          bankHolidayCalendar: calendar,
          workingWeek: week,
          annualLeavePolicyId: policyId,
        })),
        locationTerms: locations.map(({ name }) => ({
          locationName: name,
          bankHolidayCalendar: nationOf(name),
        })),
        defaultBankHolidayCalendar: defaultNation,
      },
    });

  return (
    <SetupLayout
      step="timeOff"
      title={t("setup.timeOff.title")}
      description={
        peopleCount === 1
          ? t("setup.timeOff.descriptionOne")
          : t("setup.timeOff.description", { count: String(peopleCount) })
      }
      width="wide"
    >
      <SetupStepForm
        width="wide"
        onSubmit={turnOn}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <BackToReview />
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" size="lg" onClick={() => go({ timeOff: null })}>
                {t("setup.timeOff.skip")}
              </Button>
              {/* Not before the suggestions arrive, so it never saves a nation the owner hasn't seen. */}
              <Button
                type="submit"
                size="lg"
                className="h-10 gap-2 px-4"
                disabled={!data || suggested.loading}
              >
                {t("setup.timeOff.turnOn")}
                <ArrowRight weight="bold" aria-hidden />
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-7 xl:flex-row-reverse xl:items-start">
          <p className="flex items-start gap-2 self-start rounded-lg bg-brand-soft px-3 py-2 text-[13px] leading-snug text-brand-deep xl:w-64 xl:shrink-0">
            <Lightbulb size={16} aria-hidden className="mt-px shrink-0" />
            {t("setup.timeOff.tip")}
          </p>
          <div className="@container flex min-w-0 flex-1 flex-col gap-7">
            <Question
              number={1}
              title={t("setup.timeOff.allowanceTitle")}
              hint={t("setup.timeOff.allowanceHint")}
            >
              <AllowanceCards
                policies={policies}
                selectedId={policyId}
                bankHolidays={calendarsInUse.length === 1 ? holidaysOf(calendarsInUse[0]!) : null}
                onSelect={(id) => change({ policyId: id })}
              />
            </Question>
            <Question
              number={2}
              title={t("setup.timeOff.weekTitle")}
              hint={t("setup.timeOff.weekHint")}
            >
              <WeekCards selected={week} onSelect={(next) => change({ week: next })} />
            </Question>
            <Question
              number={3}
              title={t("setup.timeOff.bankHolidaysTitle")}
              hint={
                !hasLocations
                  ? t("setup.timeOff.oneCalendarHint")
                  : suggested.loading
                    ? t("setup.timeOff.checking")
                    : t("setup.timeOff.locationsHint")
              }
            >
              {hasLocations ? (
                <LocationCalendars
                  locations={locations}
                  nationOf={nationOf}
                  unsure={unsure}
                  holidaysOf={holidaysOf}
                  onPick={(name, next) => change({ picked: { ...picked, [name]: next } })}
                  withoutLocation={withoutLocation}
                />
              ) : (
                <NationCards
                  selected={nation}
                  holidaysOf={holidaysOf}
                  onSelect={(next) => change({ nation: next })}
                />
              )}
            </Question>
            <AlsoReady />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {t("setup.timeOff.loadFailed")}
              </p>
            )}
          </div>
        </div>
      </SetupStepForm>
    </SetupLayout>
  );
}
