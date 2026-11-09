import type { EmploymentTermsTab_TermsFragment } from "@/__generated__/graphql";
import { companyToday, ruleSummary, TimeOffTypeIcon } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { changeLineOn, describeWeek, rowOf, ruleSourceLabel } from "./employmentTermsView";
import { TermsRuleRow } from "./TermsRuleRow";
import type { OwnWeekEdit } from "./useOwnWeekEdit";
import { WeekRow } from "./WeekRow";

type Terms = EmploymentTermsTab_TermsFragment;

type Props = {
  employmentTerms: Terms;
  /** The terms' name on a date, for "from England and Wales". */
  termsNameOn: (date: string) => string;
  /** The terms the person is on today, for "Not offered on England and Wales". */
  currentTermsName: string;
  firstName: string;
  viewerIsPerson: boolean;
  /** A move being edited: the person's terms before and after it, read from its date. */
  change: { before: Terms; after: Terms; date: string } | null;
  employeeId: string;
  /** Admins edit the person's own week; null for everyone else. */
  weekEdit: OwnWeekEdit | null;
  /** Another edit is open on the tab. */
  locked: boolean;
  earliest: string;
};

/** The working week row, then a row per company time off type, each with what a move changes. */
export function TermsRows({
  employmentTerms: { workingWeek, timeOff },
  termsNameOn,
  currentTermsName,
  firstName,
  viewerIsPerson,
  change,
  employeeId,
  weekEdit,
  locked,
  earliest,
}: Props) {
  const today = companyToday();
  const sourceOf = (version: { source: "FROM_THEIR_TERMS" | "THEIR_OWN"; startDate: string }) =>
    ruleSourceLabel(version.source, {
      termsName: termsNameOn(version.startDate),
      viewerIsPerson,
      personFirstName: firstName,
    });
  const notOffered = t("people.panel.terms.notOfferedLower");

  return (
    <ul>
      <WeekRow
        employeeId={employeeId}
        firstName={firstName}
        workingWeek={workingWeek}
        sourceOf={sourceOf}
        change={
          change &&
          changeLineOn(
            change.before.workingWeek,
            change.after.workingWeek,
            change.date,
            describeWeek,
            t("people.panel.terms.noWeekLower"),
          )
        }
        edit={weekEdit}
        locked={locked}
        earliest={earliest}
        termsName={currentTermsName}
      />
      {timeOff?.map(({ timeOffType, versions }) => {
        const row = rowOf(versions, today, describeRules, sourceOf, notOffered);
        const sameType = (type: { timeOffType: { id: string } }) =>
          type.timeOffType.id === timeOffType.id;
        const before = change?.before.timeOff?.find(sameType);
        const after = change?.after.timeOff?.find(sameType);
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
              changeLineOn(
                before?.versions ?? [],
                after?.versions ?? [],
                change.date,
                describeRules,
                notOffered,
              )
            }
          />
        );
      })}
    </ul>
  );
}

/** A type's rules as its row reads them: "20 days a year, bank holidays on top", or recorded only. */
function describeRules({ rules }: NonNullable<Terms["timeOff"]>[number]["versions"][number]) {
  return {
    text: rules.balance === "NO_BALANCE" ? t("terms.rule.recorded") : ruleSummary(rules),
  };
}
