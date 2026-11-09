import type { EmploymentTermsTab_TermsFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { companyToday, shortDate } from "@/features/termsDisplay";
import { t } from "@/i18n";
import { calendarDayParts } from "@/lib/calendarDay";
import { cn } from "@/lib/class-names";

import { ChangeTermsForm } from "../../ChangeTermsForm";
import { termsPeriodsOn } from "./employmentTermsView";
import { PlannedMove } from "./PlannedMove";
import { TermsLastChange } from "./TermsLastChange";
import { TermsName } from "./TermsName";
import { TermsRows } from "./TermsRows";
import type { OwnWeekEdit } from "./useOwnWeekEdit";
import type { TermsChange } from "./useTermsChange";

type Props = {
  employeeId: string;
  firstName: string;
  employmentTerms: EmploymentTermsTab_TermsFragment;
  /** The person reads about themselves: "your terms", "Your own". */
  viewerIsPerson: boolean;
  /** Admins see each terms' name as a link to its settings. */
  linksToSettings: boolean;
  /** Admins move the person to other terms here; null for everyone else. */
  change: TermsChange | null;
  /** Admins edit the person's own week here; null for everyone else. */
  weekEdit: OwnWeekEdit | null;
};

/**
 * A person's terms, working week and each time off type's rules, today and planned, and earlier
 * terms; for admins, Change terms opens in place and marks what the move changes.
 */
export function TermsCard({
  employeeId,
  firstName,
  employmentTerms,
  viewerIsPerson,
  linksToSettings,
  change,
  weekEdit,
}: Props) {
  const { periods, timeOff } = employmentTerms;
  const today = companyToday();
  const { current, planned, earlier } = termsPeriodsOn(periods, today);
  const termsNameOn = (date: string) =>
    termsPeriodsOn(periods, date).current?.termsName ?? current?.termsName ?? "";
  // A type without a balance has no leave year; the first one with one says it.
  const leaveYear = timeOff
    ?.flatMap(({ versions }) => versions)
    .find(({ rules }) => rules.leaveYearStart)?.rules.leaveYearStart;
  const editing = change?.open ?? false;
  const changeDate = change?.value.startDate ?? today;

  return (
    <section aria-labelledby="employee-terms" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="employee-terms"
          className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {t("people.panel.terms.title")}
        </h2>
        {change && (
          <Button
            variant="ghost"
            size="sm"
            disabled={editing || Boolean(weekEdit?.mode)}
            onClick={() => change.start(employmentTerms.earliestChange)}
          >
            {t("people.panel.terms.change")}
          </Button>
        )}
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-card",
          editing ? "border-foreground" : "border-border",
        )}
      >
        {change?.open && (
          <div className="border-b border-border bg-sidebar px-3 py-3">
            <ChangeTermsForm
              value={change.value}
              onChange={change.edit}
              earliest={change.earliest}
              currentTermsId={current?.termsId}
              hint={[
                t("changeTerms.hint", { terms: termsNameOn(dayBefore(changeDate)) }),
                change.after && t("changeTerms.hintMarked", { date: shortDate(changeDate) }),
              ]
                .filter(Boolean)
                .join(" ")}
              error={change.error}
              disabled={change.saving}
            />
          </div>
        )}
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
        {planned.map((period, index) => (
          <PlannedMove
            key={period.startDate}
            employeeId={employeeId}
            firstName={firstName}
            period={{ ...period, startDate: period.startDate! }}
            staysOn={(index === 0 ? current : planned[index - 1])?.termsName ?? ""}
            linksToSettings={linksToSettings}
            canCancel={Boolean(change) && !editing}
          />
        ))}
        <TermsRows
          employmentTerms={employmentTerms}
          termsNameOn={termsNameOn}
          currentTermsName={current?.termsName ?? ""}
          firstName={firstName}
          viewerIsPerson={viewerIsPerson}
          employeeId={employeeId}
          weekEdit={weekEdit}
          locked={editing}
          earliest={employmentTerms.earliestChange}
          change={
            change?.before && change.after
              ? { before: change.before, after: change.after, date: changeDate }
              : null
          }
        />
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

function dayBefore(day: string): string {
  const [year, month, date] = calendarDayParts(day);
  return new Date(Date.UTC(year, month, date - 1)).toISOString().slice(0, 10);
}

// Formatted in UTC from a UTC timestamp, so no time zone moves the calendar day.
const DAY_AND_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
