import type { EmploymentTermsTab_TermsFragment } from "@/__generated__/graphql";
import {
  calendarName,
  companyToday,
  ruleSummary,
  TimeOffTypeIcon,
  weekSummary,
} from "@/features/termsDisplay";
import { t } from "@/i18n";

import { changeLineOn, rowOf, ruleSourceLabel } from "./employmentTermsView";
import { TermsRuleRow } from "./TermsRuleRow";

type Terms = EmploymentTermsTab_TermsFragment;

type Props = {
  employmentTerms: Terms;
  /** The terms' name on a date, for "from England and Wales". */
  termsNameOn: (date: string) => string;
  /** The terms the person is on today, for "Not offered on England and Wales". */
  currentTermsName: string;
  firstName: string;
  viewerIsPerson: boolean;
  /** A move being edited: the person's terms as they would be after it, and from when. */
  change: { after: Terms; date: string } | null;
};

/** The working week row, then a row per company time off type, each with what a move changes. */
export function TermsRows({
  employmentTerms: { workingWeek, timeOff },
  termsNameOn,
  currentTermsName,
  firstName,
  viewerIsPerson,
  change,
}: Props) {
  const today = companyToday();
  const sourceOf = (version: { source: "FROM_THEIR_TERMS" | "THEIR_OWN"; startDate: string }) =>
    ruleSourceLabel(version.source, {
      termsName: termsNameOn(version.startDate),
      viewerIsPerson,
      personFirstName: firstName,
    });
  const notOffered = t("people.panel.terms.notOfferedLower");
  const week = rowOf(
    workingWeek,
    today,
    describeWeek,
    sourceOf,
    t("people.panel.terms.noWeekLower"),
  );

  return (
    <ul>
      <TermsRuleRow
        label={t("people.panel.terms.workingWeek")}
        value={week.value}
        missing={t("people.panel.terms.noWeek")}
        planned={week.planned}
        change={
          change &&
          changeLineOn(
            workingWeek,
            change.after.workingWeek,
            change.date,
            describeWeek,
            t("people.panel.terms.noWeekLower"),
          )
        }
      />
      {timeOff?.map(({ timeOffType, versions }) => {
        const row = rowOf(versions, today, describeRules, sourceOf, notOffered);
        const after = change?.after.timeOff?.find((type) => type.timeOffType.id === timeOffType.id);
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
            missing={t("people.panel.terms.notOffered", { terms: currentTermsName })}
            planned={row.planned}
            change={
              change &&
              changeLineOn(versions, after?.versions ?? [], change.date, describeRules, notOffered)
            }
          />
        );
      })}
    </ul>
  );
}

/** A week as its row reads it: "Mon–Fri, 7.5 hours", then its bank holidays. */
function describeWeek({ week }: Terms["workingWeek"][number]) {
  return {
    text: weekSummary(week),
    detail: t("people.panel.terms.bankHolidays", {
      calendar: calendarName(week.bankHolidayCalendar),
    }),
  };
}

/** A type's rules as its row reads them: "20 days a year, bank holidays on top", or recorded only. */
function describeRules({ rules }: NonNullable<Terms["timeOff"]>[number]["versions"][number]) {
  return {
    text: rules.balance === "NO_BALANCE" ? t("terms.rule.recorded") : ruleSummary(rules),
  };
}
