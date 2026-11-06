import { useQuery } from "@apollo/client/react";
import { Link, useNavigate } from "@tanstack/react-router";

import { EmploymentTermsDocument, type EmploymentTermsQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { calendarName } from "./calendarName";
import { DefaultPill } from "./DefaultPill";
import { annualLeaveSummary, splitVersions, weekSummary } from "./termsText";

type Terms = EmploymentTermsQuery["allTerms"][number];

/** Settings › Employment terms: every set of terms with its week, Annual leave, locations and people. */
export function TermsSettings() {
  // People and versions change from elsewhere, so the list reloads whenever shown.
  const { data, error, refetch } = useQuery(EmploymentTermsDocument, {
    fetchPolicy: "cache-and-network",
  });
  const navigate = useNavigate();

  return (
    <section aria-labelledby="terms-settings-title" className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="terms-settings-title" className="text-lg font-semibold">
          {t("terms.title")}
        </h2>
        <p className="max-w-[62ch] text-sm text-muted-foreground">{t("terms.description")}</p>
      </div>
      {data ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-muted/60 text-left">
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("terms.column.terms")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("terms.column.week")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("terms.column.annualLeave")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("terms.column.locations")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    {t("terms.column.people")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.allTerms.map((terms) => (
                  <tr
                    key={terms.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                    onClick={() =>
                      void navigate({
                        to: "/settings/terms/$termsId",
                        params: { termsId: terms.id },
                      })
                    }
                  >
                    <TermsCells terms={terms} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("terms.defaultNote")}</p>
        </>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("terms.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("terms.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[200px] rounded-xl" />
      )}
    </section>
  );
}

function TermsCells({ terms }: { terms: Terms }) {
  const week = splitVersions(terms.workingWeek).current;
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
            className="[overflow-wrap:anywhere] hover:underline"
          >
            {terms.name}
          </Link>
          {terms.isDefault && <DefaultPill />}
        </span>
        {week && (
          <span className="block text-[13px] text-muted-foreground">
            {t("terms.bankHolidays", { calendar: calendarName(week.bankHolidayCalendar) })}
          </span>
        )}
      </th>
      <td className="px-4 py-3">{week ? weekSummary(week) : t("terms.week.none")}</td>
      <td className="px-4 py-3">
        {annualLeaveSummary(splitVersions(annualLeave?.versions ?? []).current)}
      </td>
      <td className="px-4 py-3">{terms.locations.map(({ name }) => name).join(", ")}</td>
      <td className="px-4 py-3 text-right tabular-nums">{terms.peopleCount}</td>
    </>
  );
}
