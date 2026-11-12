import type { EmploymentTermsTab_TermsFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { changeLineOn, describeRules, describeWeek, ruleSourceLabel } from "./employmentTermsView";
import { TimeOffTypeRow } from "./TimeOffTypeRow";
import type { OwnRulesEdit, TermsOn } from "./useOwnRulesEdit";
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
  /** Admins edit the person's own rules for each type; null for everyone else. */
  rulesEdit: OwnRulesEdit | null;
  /** Another edit is open on the tab. */
  locked: boolean;
  earliest: string;
  termsOn: TermsOn;
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
  rulesEdit,
  locked,
  earliest,
  termsOn,
}: Props) {
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
        locked={locked || Boolean(rulesEdit?.mode)}
        earliest={earliest}
        termsNameOn={termsNameOn}
      />
      {timeOff?.map((type) => {
        const sameType = (other: { timeOffType: { id: string } }) =>
          other.timeOffType.id === type.timeOffType.id;
        const before = change?.before.timeOff?.find(sameType);
        const after = change?.after.timeOff?.find(sameType);
        return (
          <TimeOffTypeRow
            key={type.timeOffType.id}
            employeeId={employeeId}
            firstName={firstName}
            timeOff={type}
            sourceOf={sourceOf}
            currentTermsName={currentTermsName}
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
            edit={rulesEdit}
            locked={locked || Boolean(weekEdit?.mode)}
            earliest={earliest}
            termsOn={termsOn}
          />
        );
      })}
    </ul>
  );
}
