import { useQuery } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  type BankHolidayCalendar,
  LeaveStepDocument,
  LocationCalendarSuggestionsDocument,
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
import { LocationsStep, NationChoice, PolicyCards, Step, WeekCards } from "./LeaveChoices";
import { daysOffInAll, daysOffSummary, NATIONS, WEEKS } from "./leaveOptions";
import { type LeaveSetupState, readLeaveSetup, saveLeaveSetup } from "./leaveChoice";

type Props = {
  /** Who uses Broccoli's answers, carried through when the owner came back from it. */
  search: SetupInviteSearch;
};

/**
 * "Set up leave", after Approve: which nation's terms each location gets, Broccoli's AI
 * suggesting them from the names, then each nation's Annual leave and working week. Nothing is
 * saved on the server here: the choice goes with setup's last page.
 */
export function LeaveStep({ search }: Props) {
  // Kept in the tab on every change, so a reload or Back to the review keeps the owner's choices.
  const [state, setState] = useState(readLeaveSetup);
  const { weeks, policies, picked } = state;
  const change = (next: Partial<LeaveSetupState>) => {
    const changed = { ...state, ...next };
    setState(changed);
    saveLeaveSetup(changed);
  };
  const { data, error } = useQuery(LeaveStepDocument, { fetchPolicy: "cache-and-network" });
  const navigate = useNavigate();
  const { next: nextPath } = useSetupPages("leave");

  const locations = data?.import.readyLocations ?? [];
  const suggested = useQuery(LocationCalendarSuggestionsDocument, {
    variables: { locationNames: locations.map(({ name }) => name) },
    skip: locations.length === 0,
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

  const policyOptions = data?.leaveSetup.annualLeavePolicies ?? [];
  const nations = NATIONS.filter(
    (nation) =>
      nation === "ENGLAND_AND_WALES" || locations.some(({ name }) => nationOf(name) === nation),
  );
  const weekOf = (nation: BankHolidayCalendar) => weeks[nation] ?? WEEKS[0];
  const policyOf = (nation: BankHolidayCalendar) =>
    policyOptions.find(({ id }) => id === policies[nation]) ?? policyOptions[0];
  const holidaysOf = (nation: BankHolidayCalendar) =>
    data?.leaveSetup.bankHolidayCalendars.find(({ calendar }) => calendar === nation)
      ?.countThisYear ?? 0;
  const withoutLocation =
    (data?.import.readyEmployeeCount ?? 0) -
    locations.reduce((sum, { peopleCount }) => sum + peopleCount, 0);
  const peopleOf = (nation: BankHolidayCalendar) =>
    locations
      .filter(({ name }) => nationOf(name) === nation)
      .reduce((sum, { peopleCount }) => sum + peopleCount, 0) +
    (nation === "ENGLAND_AND_WALES" ? withoutLocation : 0);
  // Location cards come first when there are locations, so the steps count from there.
  const firstStep = locations.length > 0 ? 2 : 1;

  const go = (next: Partial<LeaveSetupState>) => {
    change(next);
    void navigate({ to: nextPath, search });
  };
  const turnOn = () =>
    go({
      // The nations on screen become the owner's, so a later visit keeps them whatever the model says then.
      picked: Object.fromEntries(locations.map(({ name }) => [name, nationOf(name)])),
      leave: {
        terms: nations.map((nation) => ({
          bankHolidayCalendar: nation,
          workingWeek: weekOf(nation),
          annualLeavePolicyId: policyOf(nation)?.id ?? "",
        })),
        locationTerms: locations.map(({ name }) => ({
          locationName: name,
          bankHolidayCalendar: nationOf(name),
        })),
      },
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
              {data && (
                <span className="text-sm text-muted-foreground">
                  {daysOffSummary(
                    nations.map((nation) => ({
                      nation,
                      daysOff: daysOffInAll(policyOf(nation), holidaysOf(nation)),
                    })),
                  )}
                </span>
              )}
              <Button type="button" variant="ghost" size="lg" onClick={() => go({ leave: null })}>
                {t("setup.leave.skip")}
              </Button>
              {/* Not before the suggestions arrive, so it never saves a nation the owner hasn't seen. */}
              <Button
                type="submit"
                size="lg"
                className="h-10 gap-2 px-4"
                disabled={!data || suggested.loading}
              >
                {t("setup.leave.turnOn")}
                <ArrowRight weight="bold" aria-hidden />
              </Button>
            </div>
          </div>
        }
      >
        {locations.length > 0 && (
          <LocationsStep
            names={locations.map(({ name }) => name)}
            nationOf={nationOf}
            unsure={unsure}
            checking={suggested.loading}
            onPick={(name, nation) => change({ picked: { ...picked, [name]: nation } })}
          />
        )}
        <Step
          number={firstStep}
          title={t("setup.leave.holidayTitle")}
          hint={t("setup.leave.holidayHint")}
        >
          {nations.map((nation) => (
            <NationChoice
              key={nation}
              nation={nation}
              people={peopleOf(nation)}
              showName={nations.length > 1}
            >
              <PolicyCards
                nation={nation}
                policies={policyOptions}
                selectedId={policyOf(nation)?.id ?? ""}
                bankHolidays={holidaysOf(nation)}
                onSelect={(id) => change({ policies: { ...policies, [nation]: id } })}
              />
            </NationChoice>
          ))}
        </Step>
        <Step
          number={firstStep + 1}
          title={t("setup.leave.weekTitle")}
          hint={t("setup.leave.weekHint")}
        >
          {nations.map((nation) => (
            <NationChoice key={nation} nation={nation} showName={nations.length > 1}>
              <WeekCards
                nation={nation}
                selected={weekOf(nation)}
                onSelect={(week) => change({ weeks: { ...weeks, [nation]: week } })}
              />
            </NationChoice>
          ))}
        </Step>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.leave.loadFailed")}
          </p>
        )}
      </SetupStepForm>
    </SetupLayout>
  );
}
