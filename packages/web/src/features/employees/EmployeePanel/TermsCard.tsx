import { CalendarBlank } from "@phosphor-icons/react";

import type { EmploymentTermsTabQuery } from "@/__generated__/graphql";
import {
  calendarName,
  companyToday,
  ruleSummary,
  shortDate,
  TimeOffTypeIcon,
  weekSummary,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { rowOf, ruleSourceLabel, termsPeriodsOn } from "./employmentTermsView";
import { TermsLastChange } from "./TermsLastChange";
import { TermsName } from "./TermsName";
import { TermsRuleRow } from "./TermsRuleRow";

type EmploymentTerms = NonNullable<
  NonNullable<EmploymentTermsTabQuery["employee"]>["employmentTerms"]
>;

type Props = {
  employeeId: string;
  firstName: string;
  employmentTerms: EmploymentTerms;
  /** The person reads about themselves: "your terms", "Your own". */
  viewerIsPerson: boolean;
  /** Admins see each terms' name as a link to its settings. */
  linksToSettings: boolean;
};

/** A person's terms, working week and each time off type's rules, today and planned, and earlier terms. */
export function TermsCard({
  employeeId,
  firstName,
  employmentTerms: { periods, workingWeek, timeOff },
  viewerIsPerson,
  linksToSettings,
}: Props) {
  const today = companyToday();
  const { current, planned, earlier } = termsPeriodsOn(periods, today);
  const termsNameOn = (date: string) =>
    termsPeriodsOn(periods, date).current?.termsName ?? current?.termsName ?? "";
  const sourceOf = (version: { source: "FROM_THEIR_TERMS" | "THEIR_OWN"; startDate: string }) =>
    ruleSourceLabel(version.source, {
      termsName: termsNameOn(version.startDate),
      viewerIsPerson,
      personFirstName: firstName,
    });
  const week = rowOf(
    workingWeek,
    today,
    ({ week: version }) => ({
      text: weekSummary(version),
      detail: t("people.panel.terms.bankHolidays", {
        calendar: calendarName(version.bankHolidayCalendar),
      }),
    }),
    sourceOf,
  );
  const leaveYear = timeOff?.flatMap(({ versions }) => versions)[0]?.rules.leaveYearStart;

  return (
    <section aria-labelledby="employee-terms" className="flex flex-col gap-2">
      <h2
        id="employee-terms"
        className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {t("people.panel.terms.title")}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-2.5 border-b border-border bg-sidebar px-3 py-2.5">
          {current ? (
            <>
              <TermsName period={current} linksToSettings={linksToSettings} />
              <span className="text-[13px] text-muted-foreground">
                {current.startDate
                  ? t("people.panel.terms.since", { date: shortDate(current.startDate) })
                  : t("people.panel.terms.sinceStart")}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{t("people.panel.terms.noTerms")}</span>
          )}
        </div>
        {planned.map((period) => (
          <p
            key={period.startDate}
            className="mx-3 mt-2.5 flex items-center gap-2 rounded-lg bg-sidebar px-3 py-1.5 text-sm"
          >
            <CalendarBlank aria-hidden className="shrink-0" />
            <span>
              <span className="font-semibold">
                {t("people.panel.terms.plannedFrom", { date: shortDate(period.startDate ?? "") })}
              </span>{" "}
              <TermsName period={period} linksToSettings={linksToSettings} />
            </span>
          </p>
        ))}
        <ul>
          <TermsRuleRow
            label={t("people.panel.terms.workingWeek")}
            value={week.value}
            missing={t("people.panel.terms.noWeek")}
            planned={week.planned}
          />
          {timeOff?.map(({ timeOffType, versions }) => {
            const row = rowOf(
              versions,
              today,
              ({ rules }) => ({
                text:
                  rules.balance === "NO_BALANCE" ? t("terms.rule.recorded") : ruleSummary(rules),
              }),
              sourceOf,
            );
            return (
              <TermsRuleRow
                key={timeOffType.id}
                label={
                  <>
                    <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
                    <span className="[overflow-wrap:anywhere]">{timeOffType.name}</span>
                  </>
                }
                value={row.value}
                missing={t("people.panel.terms.notOffered", { terms: current?.termsName ?? "" })}
                planned={row.planned}
              />
            );
          })}
        </ul>
        {leaveYear && (
          <p className="border-t border-border/60 px-3 py-2 text-[13px] text-muted-foreground">
            {leaveYear.kind === "LEAVE_YEAR_FROM_EMPLOYEE_START_DATE"
              ? t("people.panel.terms.leaveYearFromStart")
              : t("people.panel.terms.leaveYear", {
                  date: DAY_AND_MONTH.format(
                    Date.UTC(2000, (leaveYear.month ?? 1) - 1, leaveYear.day ?? 1),
                  ),
                })}
          </p>
        )}
        {earlier.length > 0 && (
          <details className="border-t border-border/60 px-3 py-2 text-[13px]">
            <summary className="cursor-pointer text-muted-foreground">
              {t("people.panel.terms.earlier", { count: String(earlier.length) })}
            </summary>
            <ul className="mt-1.5 flex flex-col gap-1">
              {earlier.map((period) => (
                <li key={period.startDate ?? "first"} className="flex flex-wrap gap-x-2">
                  <TermsName period={period} linksToSettings={linksToSettings} />
                  <span className="text-muted-foreground">
                    {t("people.panel.terms.earlierPeriod", {
                      from: period.startDate
                        ? shortDate(period.startDate)
                        : t("people.panel.terms.sinceStart"),
                      until: shortDate(period.endDate ?? ""),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <TermsLastChange employeeId={employeeId} />
    </section>
  );
}

// Formatted in UTC from a UTC timestamp, so no time zone moves the calendar day.
const DAY_AND_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
