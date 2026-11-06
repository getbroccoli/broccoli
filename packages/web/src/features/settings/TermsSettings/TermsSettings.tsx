import { useQuery } from "@apollo/client/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  type BankHolidayCalendar,
  EmploymentTermsDocument,
  type EmploymentTermsQuery,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { NewTermsDialog } from "./NewTermsDialog";
import { TermsRowCells } from "./TermsRowCells";

/** Settings › Employment terms: every set of terms with its week, Annual leave, locations and people. */
export function TermsSettings() {
  // People and versions change from elsewhere, so the list reloads whenever shown.
  const { data, error, refetch } = useQuery(EmploymentTermsDocument, {
    fetchPolicy: "cache-and-network",
  });
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const openTerms = (termsId: string) =>
    void navigate({ to: "/settings/terms/$termsId", params: { termsId } });

  return (
    <section aria-labelledby="terms-settings-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="terms-settings-title" className="text-lg font-semibold">
            {t("terms.title")}
          </h2>
          <p className="max-w-[62ch] text-sm text-muted-foreground">{t("terms.description")}</p>
        </div>
        {data && (
          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            {t("terms.new")}
          </Button>
        )}
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
                    onClick={() => openTerms(terms.id)}
                  >
                    <TermsRowCells terms={terms} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("terms.defaultNote")}</p>
          <NewTermsDialog
            open={creating}
            onOpenChange={setCreating}
            termsNames={data.allTerms.map(({ name }) => name)}
            defaultCalendar={defaultCalendarOf(data.allTerms)}
            onCreated={(termsId) => {
              setCreating(false);
              openTerms(termsId);
            }}
          />
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

/** The default terms' bank holidays today, which new terms start with; England and Wales without any. */
function defaultCalendarOf(allTerms: EmploymentTermsQuery["allTerms"]): BankHolidayCalendar {
  const today = allTerms.find(({ isDefault }) => isDefault)?.workingWeek[0];
  return today?.bankHolidayCalendar ?? "ENGLAND_AND_WALES";
}
