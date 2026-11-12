import { Link } from "@tanstack/react-router";

import type { EmploymentTermsQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import {
  annualLeaveSummary,
  calendarName,
  companyToday,
  splitVersions,
  weekSummary,
} from "@/features/termsDisplay";

import { DefaultPill } from "./DefaultPill";
import { DraftPill } from "./DraftPill";

type Props = {
  terms: EmploymentTermsQuery["allTerms"][number];
};

/** One set of terms' cells in the list: name, week, Annual leave today and people. */
export function TermsRowCells({ terms }: Props) {
  const week = splitVersions(terms.workingWeek, companyToday()).current;
  const annualLeave = terms.timeOff.find(
    ({ timeOffType }) => timeOffType.typeKey === "ANNUAL_LEAVE",
  );
  return (
    <>
      <th scope="row" className="px-4 py-3 text-left font-normal">
        <span className="flex items-center gap-2 font-semibold">
          {/* The row opens the terms too; the link gives keyboards and screen readers the way in. */}
          <Link
            to="/settings/terms/$termsId"
            params={{ termsId: terms.id }}
            onClick={(event) => event.stopPropagation()}
            className="[overflow-wrap:anywhere] hover:underline"
          >
            {terms.name}
          </Link>
          {terms.isDefault && <DefaultPill />}
          {terms.hasUnpublishedChanges && <DraftPill />}
        </span>
        {week && (
          <span className="block text-[13px] text-muted-foreground">
            {t("terms.bankHolidays", { calendar: calendarName(week.bankHolidayCalendar) })}
          </span>
        )}
      </th>
      <td className="px-4 py-3">{week ? weekSummary(week) : t("terms.week.notSet")}</td>
      <td className="px-4 py-3">
        {annualLeaveSummary(splitVersions(annualLeave?.versions ?? [], companyToday()).current)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{terms.peopleCount}</td>
    </>
  );
}
